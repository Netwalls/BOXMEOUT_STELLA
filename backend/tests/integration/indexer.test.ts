/**
 * Integration tests for StellarIndexer handlers.
 *
 * Requires a running PostgreSQL instance pointed to by DATABASE_URL.
 * Default: postgresql://boxmeout:boxmeout@localhost:5433/boxmeout_test
 * Start with: docker compose --profile test up -d postgres-test
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import {
  handleMarketCreated,
  handleBetPlaced,
  handleMarketResolved,
  handleMarketCancelled,
  handleWinningsClaimed,
} from '../../src/indexer/StellarIndexer';

// Point the pool at the test DB
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://boxmeout:boxmeout@localhost:5433/boxmeout_test';

// Re-import pool AFTER env is set
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { pool } = require('../../src/config/db') as { pool: Pool };

const SCHEMA = fs.readFileSync(path.join(__dirname, '../../db/schema.sql'), 'utf8');

// ── Helpers ──────────────────────────────────────────────────────────────────

function event(type: string, data: Record<string, unknown>, txHash = `tx-${Math.random()}`) {
  return {
    contract_address: 'CTEST',
    event_type: type,
    topics: [],
    data: JSON.stringify(data),
    ledger_sequence: 1000,
    ledger_close_time: new Date().toISOString(),
    tx_hash: txHash,
  };
}

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { rows } = await pool.query(sql, params);
  return rows as T[];
}

const MARKET_ID = 'mkt-test-1';
const BETTOR = 'GBETTOR1';

const marketEvent = () =>
  event('MarketCreated', {
    market_id: MARKET_ID,
    match_id: 'fight-1',
    fighter_a: 'Ali',
    fighter_b: 'Frazier',
    weight_class: 'heavyweight',
    title_fight: false,
    venue: 'MSG',
    scheduled_at: '2026-06-01T00:00:00Z',
    fee_bps: 200,
  });

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  await pool.query(SCHEMA);
});

beforeEach(async () => {
  await pool.query('TRUNCATE markets, bets, blockchain_events, indexer_checkpoints RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await pool.end();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('handleMarketCreated', () => {
  it('inserts correct Market row', async () => {
    await handleMarketCreated(marketEvent());
    const [row] = await q('SELECT * FROM markets WHERE market_id = $1', [MARKET_ID]);
    expect(row.market_id).toBe(MARKET_ID);
    expect(row.fighter_a).toBe('Ali');
    expect(row.fighter_b).toBe('Frazier');
    expect(row.status).toBe('open');
  });

  it('is idempotent — duplicate event inserts no extra row', async () => {
    const e = marketEvent();
    await handleMarketCreated(e);
    await handleMarketCreated(e);
    const rows = await q('SELECT * FROM markets WHERE market_id = $1', [MARKET_ID]);
    expect(rows).toHaveLength(1);
  });
});

describe('handleBetPlaced', () => {
  beforeEach(() => handleMarketCreated(marketEvent()));

  it('inserts Bet and updates pool totals atomically', async () => {
    await handleBetPlaced(
      event('BetPlaced', { market_id: MARKET_ID, bettor_address: BETTOR, side: 'fighter_a', amount: '50000000' }, 'tx-bet-1'),
    );
    const [bet] = await q('SELECT * FROM bets WHERE tx_hash = $1', ['tx-bet-1']);
    expect(bet.bettor_address).toBe(BETTOR);
    expect(bet.side).toBe('fighter_a');

    const [market] = await q('SELECT pool_a, total_pool FROM markets WHERE market_id = $1', [MARKET_ID]);
    expect(Number(market.pool_a)).toBe(50_000_000);
    expect(Number(market.total_pool)).toBe(50_000_000);
  });

  it('is idempotent — duplicate bet tx inserts no extra row', async () => {
    const e = event('BetPlaced', { market_id: MARKET_ID, bettor_address: BETTOR, side: 'fighter_a', amount: '50000000' }, 'tx-bet-dup');
    await handleBetPlaced(e);
    await handleBetPlaced(e);
    const rows = await q('SELECT * FROM bets WHERE tx_hash = $1', ['tx-bet-dup']);
    expect(rows).toHaveLength(1);
  });
});

describe('handleMarketResolved', () => {
  beforeEach(() => handleMarketCreated(marketEvent()));

  it('updates status and outcome', async () => {
    await handleMarketResolved(
      event('MarketResolved', { market_id: MARKET_ID, outcome: 'fighter_a', resolved_at: new Date().toISOString(), oracle_used: 'primary' }),
    );
    const [row] = await q('SELECT status, outcome, oracle_used FROM markets WHERE market_id = $1', [MARKET_ID]);
    expect(row.status).toBe('resolved');
    expect(row.outcome).toBe('fighter_a');
    expect(row.oracle_used).toBe('primary');
  });
});

describe('handleMarketCancelled', () => {
  beforeEach(() => handleMarketCreated(marketEvent()));

  it('updates status to cancelled', async () => {
    await handleMarketCancelled(event('MarketCancelled', { market_id: MARKET_ID }));
    const [row] = await q('SELECT status FROM markets WHERE market_id = $1', [MARKET_ID]);
    expect(row.status).toBe('cancelled');
  });
});

describe('handleWinningsClaimed', () => {
  beforeEach(async () => {
    await handleMarketCreated(marketEvent());
    await handleBetPlaced(
      event('BetPlaced', { market_id: MARKET_ID, bettor_address: BETTOR, side: 'fighter_a', amount: '50000000' }, 'tx-bet-claim'),
    );
  });

  it('marks bets claimed with payout', async () => {
    await handleWinningsClaimed(
      event('WinningsClaimed', { market_id: MARKET_ID, bettor_address: BETTOR, payout: '95000000' }),
    );
    const [bet] = await q('SELECT claimed, payout FROM bets WHERE tx_hash = $1', ['tx-bet-claim']);
    expect(bet.claimed).toBe(true);
    expect(Number(bet.payout)).toBe(95_000_000);
  });
});
