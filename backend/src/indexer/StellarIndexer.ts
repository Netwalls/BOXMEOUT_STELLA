// ============================================================
// BOXMEOUT — Stellar Blockchain Indexer
//
// Listens to the Stellar network for contract events emitted
// by MarketFactory, Market, and Treasury contracts.
// Persists all relevant state changes to the PostgreSQL DB.
//
// Contributors: implement every function marked TODO.
// DO NOT change function signatures.
// ============================================================

import { pool } from '../config/db';
import { logger } from '../utils/logger';

// Raw event shape returned by Stellar RPC / Horizon
export interface RawStellarEvent {
  contract_address: string;
  event_type: string;
  topics: string[];
  data: string; // XDR-encoded event data
  ledger_sequence: number;
  ledger_close_time: string;
  tx_hash: string;
}

export async function startIndexer(): Promise<void> {
  const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5000);
  const STELLAR_RPC_URL = process.env.STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org';

  try {
    let currentLedger = await getLastProcessedLedger();
    logger.info(`Indexer starting from ledger ${currentLedger}`);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        // Fetch latest ledger from Stellar RPC
        const response = await fetch(`${STELLAR_RPC_URL}/ledgers?limit=1&order=desc`);
        const data = (await response.json()) as { records?: Array<{ sequence: number }> };
        const latestLedger = data.records?.[0]?.sequence ?? currentLedger;

        // Process each new ledger
        if (latestLedger > currentLedger) {
          for (let seq = currentLedger + 1; seq <= latestLedger; seq++) {
            await processLedger(seq);
            await saveCheckpoint(seq);
            currentLedger = seq;
          }
        } else {
          // No new ledgers, sleep
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }
      } catch (err) {
        logger.error({ err }, 'Error in indexer polling loop');
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    }
  } catch (err) {
    logger.error({ err }, 'Unrecoverable indexer error');
    process.exit(1);
  }
}

export async function processLedger(ledger_sequence: number): Promise<void> {
  const STELLAR_RPC_URL = process.env.STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org';

  try {
    // Fetch events for this ledger
    const response = await fetch(
      `${STELLAR_RPC_URL}/events?start_ledger=${ledger_sequence}&end_ledger=${ledger_sequence}`,
    );
    const data = (await response.json()) as { events?: RawStellarEvent[] };
    const events = data.events ?? [];

    // Process each event
    for (const event of events) {
      await processEvent(event);
    }
  } catch (err) {
    logger.error({ err }, `Error processing ledger ${ledger_sequence}`);
    throw err;
  }
}

export async function processEvent(event: RawStellarEvent): Promise<void> {
  try {
    // Store raw event in blockchain_events table
    await pool.query(
      `INSERT INTO blockchain_events
         (contract_address, event_type, payload, ledger_sequence, ledger_close_time, tx_hash, processed)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tx_hash) DO NOTHING`,
      [
        event.contract_address,
        event.event_type,
        parsePayload(event.data),
        event.ledger_sequence,
        new Date(event.ledger_close_time),
        event.tx_hash,
        false,
      ],
    );

    // Route to appropriate handler
    switch (event.event_type) {
      case 'MarketCreated':
        await handleMarketCreated(event);
        break;
      case 'BetPlaced':
        await handleBetPlaced(event);
        break;
      case 'MarketLocked':
        await handleMarketLocked(event);
        break;
      case 'MarketResolved':
        await handleMarketResolved(event);
        break;
      case 'MarketCancelled':
        await handleMarketCancelled(event);
        break;
      case 'WinningsClaimed':
        await handleWinningsClaimed(event);
        break;
      default:
        logger.debug({ eventType: event.event_type }, 'Unknown event type');
    }

    // Mark as processed
    await pool.query(
      `UPDATE blockchain_events SET processed = TRUE WHERE tx_hash = $1`,
      [event.tx_hash],
    );
  } catch (err) {
    logger.error({ err, txHash: event.tx_hash }, 'Error processing event');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePayload(data: string): Record<string, unknown> {
  try { return JSON.parse(data); } catch { return {}; }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function handleMarketCreated(event: RawStellarEvent): Promise<void> {
  const p = parsePayload(event.data);
  await pool.query(
    `INSERT INTO markets
       (market_id, contract_address, match_id, fighter_a, fighter_b,
        weight_class, title_fight, venue, scheduled_at, fee_bps, ledger_sequence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (market_id) DO NOTHING`,
    [
      p.market_id,
      event.contract_address,
      p.match_id ?? '',
      p.fighter_a ?? '',
      p.fighter_b ?? '',
      p.weight_class ?? '',
      p.title_fight ?? false,
      p.venue ?? '',
      p.scheduled_at ?? new Date(),
      p.fee_bps ?? 200,
      event.ledger_sequence,
    ],
  );
}

export async function handleBetPlaced(event: RawStellarEvent): Promise<void> {
  const p = parsePayload(event.data);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO bets
         (market_id, bettor_address, side, amount, amount_xlm, placed_at, tx_hash, ledger_sequence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tx_hash) DO NOTHING`,
      [
        p.market_id,
        p.bettor_address,
        p.side,
        p.amount,
        Number(p.amount) / 10_000_000,
        p.placed_at ?? new Date(),
        event.tx_hash,
        event.ledger_sequence,
      ],
    );
    const col = p.side === 'fighter_a' ? 'pool_a' : p.side === 'fighter_b' ? 'pool_b' : 'pool_draw';
    await client.query(
      `UPDATE markets
          SET ${col}      = ${col} + $1,
              total_pool  = total_pool + $1,
              updated_at  = NOW()
        WHERE market_id   = $2`,
      [p.amount, p.market_id],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function handleMarketLocked(event: RawStellarEvent): Promise<void> {
  const p = parsePayload(event.data);
  await pool.query(
    `UPDATE markets SET status = 'locked', updated_at = NOW() WHERE market_id = $1`,
    [p.market_id],
  );
}

export async function handleMarketResolved(event: RawStellarEvent): Promise<void> {
  const p = parsePayload(event.data);
  await pool.query(
    `UPDATE markets
        SET status = 'resolved', outcome = $1, resolved_at = $2, oracle_used = $3, updated_at = NOW()
      WHERE market_id = $4`,
    [p.outcome, p.resolved_at ?? new Date(), p.oracle_used ?? null, p.market_id],
  );
}

export async function handleMarketCancelled(event: RawStellarEvent): Promise<void> {
  const p = parsePayload(event.data);
  await pool.query(
    `UPDATE markets SET status = 'cancelled', updated_at = NOW() WHERE market_id = $1`,
    [p.market_id],
  );
}

export async function handleWinningsClaimed(event: RawStellarEvent): Promise<void> {
  const p = parsePayload(event.data);
  await pool.query(
    `UPDATE bets
        SET claimed = TRUE, claimed_at = NOW(), payout = $1
      WHERE market_id = $2 AND bettor_address = $3`,
    [p.payout ?? null, p.market_id, p.bettor_address],
  );
}

export async function getLastProcessedLedger(): Promise<number> {
  const { rows } = await pool.query(
    `SELECT last_processed_ledger FROM indexer_checkpoints ORDER BY id DESC LIMIT 1`,
  );
  return rows[0]?.last_processed_ledger ?? Number(process.env.GENESIS_LEDGER ?? 0);
}

export async function saveCheckpoint(ledger_sequence: number): Promise<void> {
  await pool.query(
    `INSERT INTO indexer_checkpoints (id, last_processed_ledger)
     VALUES (1, $1)
     ON CONFLICT (id) DO UPDATE
       SET last_processed_ledger = EXCLUDED.last_processed_ledger,
           updated_at = NOW()`,
    [ledger_sequence],
  );
}

export async function backfillLedgerRange(
  from_ledger: number,
  to_ledger: number,
  batch_size: number,
): Promise<void> {
  for (let l = from_ledger; l <= to_ledger; l += batch_size) {
    const end = Math.min(l + batch_size - 1, to_ledger);
    for (let seq = l; seq <= end; seq++) {
      await processLedger(seq);
    }
  }
}
