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
import { rpc } from '@stellar/stellar-sdk';

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

const RPC_URL = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';
const FACTORY_CONTRACT = process.env.FACTORY_CONTRACT_ADDRESS || '';
const TREASURY_CONTRACT = process.env.TREASURY_CONTRACT_ADDRESS || '';

const server = new rpc.Server(RPC_URL);

export async function startIndexer(): Promise<void> {
  const pollInterval = Number(process.env.POLL_INTERVAL_MS ?? 5000);
  let lastProcessed = await getLastProcessedLedger();

  console.log(`[Indexer] Starting from ledger ${lastProcessed}`);

  while (true) {
    try {
      // Get the latest ledger sequence from Stellar RPC
      const latestLedgerResponse = await server.getLatestLedger();
      const latestLedger = latestLedgerResponse.sequence;

      if (latestLedger > lastProcessed) {
        for (let seq = lastProcessed + 1; seq <= latestLedger; seq++) {
          await processLedger(seq);
          await saveCheckpoint(seq);
          lastProcessed = seq;
        }
      } else {
        // No new ledgers, sleep
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    } catch (err) {
      console.error('[Indexer] Unrecoverable error:', err);
      process.exit(1);
    }
  }
}

export async function processLedger(ledger_sequence: number): Promise<void> {
  try {
    const request: rpc.Api.GetEventsRequest = {
      startLedger: ledger_sequence,
      filters: [
        {
          type: 'contract',
          contractIds: [FACTORY_CONTRACT, TREASURY_CONTRACT],
          topics: [['*']]
        }
      ],
      limit: 100
    };

    const response = await server.getEvents(request);

    if (!response.events || response.events.length === 0) {
      return;
    }

    for (const event of response.events) {
      const contractId = typeof event.contractId === 'string' ? event.contractId : event.contractId?.toString() || '';

      const rawEvent: RawStellarEvent = {
        contract_address: contractId,
        event_type: event.topic[0]?.toString() || 'unknown',
        topics: event.topic.map(t => t.toString()),
        data: JSON.stringify(event.value),
        ledger_sequence: event.ledger,
        ledger_close_time: event.ledgerClosedAt,
        tx_hash: event.txHash
      };

      // Persist raw event to blockchain_events table — use DO UPDATE so
      // re-indexing during a backfill refreshes stale rows instead of skipping.
      await pool.query(
        `INSERT INTO blockchain_events
           (contract_address, event_type, payload, ledger_sequence, ledger_close_time, tx_hash)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tx_hash) DO UPDATE
           SET contract_address  = EXCLUDED.contract_address,
               event_type        = EXCLUDED.event_type,
               payload           = EXCLUDED.payload,
               ledger_close_time = EXCLUDED.ledger_close_time`,
        [
          rawEvent.contract_address,
          rawEvent.event_type,
          rawEvent.data,
          rawEvent.ledger_sequence,
          rawEvent.ledger_close_time,
          rawEvent.tx_hash
        ]
      );

      // Process the event
      await processEvent(rawEvent);
    }
  } catch (err) {
    console.error(`Error processing ledger ${ledger_sequence}:`, err);
  }
}

export async function processEvent(event: RawStellarEvent): Promise<void> {
  try {
    const eventType = event.event_type;

    if (eventType === 'MarketCreated') {
      await handleMarketCreated(event);
    } else if (eventType === 'BetPlaced') {
      await handleBetPlaced(event);
    } else if (eventType === 'MarketLocked') {
      await handleMarketLocked(event);
    } else if (eventType === 'MarketResolved') {
      await handleMarketResolved(event);
    } else if (eventType === 'MarketCancelled') {
      await handleMarketCancelled(event);
    } else if (eventType === 'WinningsClaimed') {
      await handleWinningsClaimed(event);
    }
  } catch (err) {
    console.error(`Error processing event ${event.tx_hash}:`, err);
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
        weight_class, title_fight, venue, scheduled_at, fee_bps, status, ledger_sequence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
      'open',
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update market status and outcome
    await client.query(
      `UPDATE markets
          SET status = 'resolved', outcome = $1, resolved_at = $2, oracle_used = $3, updated_at = NOW()
        WHERE market_id = $4`,
      [p.outcome, event.ledger_close_time, p.oracle_address ?? null, p.market_id],
    );

    // Get all unique bettors for this market
    const { rows: bettors } = await client.query(
      `SELECT DISTINCT bettor_address FROM bets WHERE market_id = $1`,
      [p.market_id]
    );

    // Enqueue notification job for each bettor
    for (const bettor of bettors) {
      await client.query(
        `INSERT INTO notification_jobs (bettor_address, market_id, job_type, status, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [bettor.bettor_address, p.market_id, 'market_resolved', 'pending']
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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

/**
 * Backfills all ledgers in [from_ledger, to_ledger] inclusive.
 *
 * - Processes ledgers in ascending order.
 * - Fetches events in batches of `batch_size` to avoid memory pressure.
 * - Uses ON CONFLICT DO UPDATE (via processLedger) so re-runs are safe.
 * - Logs progress every 1 000 ledgers and emits a completion summary.
 */
export async function backfillLedgerRange(
  from_ledger: number,
  to_ledger: number,
  batch_size: number,
): Promise<void> {
  const total = to_ledger - from_ledger + 1;
  console.log(
    `[Backfill] Starting — ledgers ${from_ledger}–${to_ledger} ` +
    `(${total} ledgers, batch_size=${batch_size})`,
  );

  let processed = 0;

  for (let batchStart = from_ledger; batchStart <= to_ledger; batchStart += batch_size) {
    const batchEnd = Math.min(batchStart + batch_size - 1, to_ledger);

    for (let seq = batchStart; seq <= batchEnd; seq++) {
      await processLedger(seq);
      processed++;

      if (processed % 1_000 === 0) {
        const pct = ((processed / total) * 100).toFixed(1);
        console.log(
          `[Backfill] Progress: ${processed}/${total} ledgers processed ` +
          `(${pct}%, current ledger: ${seq})`,
        );
      }
    }

    // Persist checkpoint after every batch so a restart only re-does the last batch
    await saveCheckpoint(batchEnd);
  }

  console.log(`[Backfill] Complete — ${processed} ledgers processed.`);
}
