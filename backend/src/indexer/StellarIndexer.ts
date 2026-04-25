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

import type { BlockchainEvent } from '../models/BlockchainEvent';
import { pool } from '../config/db';

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
  // TODO: implement
}

export async function processLedger(ledger_sequence: number): Promise<void> {
  // TODO: implement
}

export async function processEvent(event: RawStellarEvent): Promise<void> {
  // TODO: implement
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
