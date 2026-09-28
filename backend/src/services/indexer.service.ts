import { PrismaClient } from "@prisma/client";
import pino from "pino";
import { SorobanRpc } from "@stellar/stellar-sdk";

import * as marketService from "./market.service";
import * as betService from "./bet.service";
import { markBetClaimed } from "./bet.service";
import { publishMarketEvent } from "../events/marketEvents";
import { indexerLedgerLag } from "../metrics";

const logger = pino({ name: "indexer" });

// ─────────────────────────────────────────────────────────────────────────────
// #1228 B-50 — Contract topic → canonical handler name mapping
//
// On-chain topics emitted by the Soroban contracts use different casing than
// the original switch/case. This single mapping table is the authoritative
// source of truth — shared with C-60/C-61 naming conventions.
//
// Canonical name    ← on-chain topic(s)
// ─────────────────────────────────────
// MarketCreated     ← market_created
// BetPlaced         ← bet_placed
// MarketResolved    ← market_resolved
// MarketCancelled   ← market_cancelled
// WinningsClaimed   ← winnings_claimed
// RefundClaimed     ← refund_claimed
// MarketLocked      ← MarketLocked (already PascalCase on-chain)
// DisputeRaised     ← DisputeRaised
// DisputeResolved   ← DisputeResolved
// FeesWithdrawn     ← FeesWithdrawn  (logged + stored; no handler yet)
// EmrgDrain         ← EmrgDrain      (logged + stored; no handler yet)
// ─────────────────────────────────────────────────────────────────────────────
export const CONTRACT_TOPIC_MAP: Record<string, string> = {
  // snake_case on-chain topics
  market_created: "MarketCreated",
  bet_placed: "BetPlaced",
  market_resolved: "MarketResolved",
  market_cancelled: "MarketCancelled",
  winnings_claimed: "WinningsClaimed",
  refund_claimed: "RefundClaimed",
  market_locked: "MarketLocked",
  dispute_raised: "DisputeRaised",
  dispute_resolved: "DisputeResolved",
  fees_withdrawn: "FeesWithdrawn",
  emrg_drain: "EmrgDrain",
  // PascalCase on-chain topics (already correct, mapped to canonical name)
  MarketCreated: "MarketCreated",
  BetPlaced: "BetPlaced",
  MarketResolved: "MarketResolved",
  MarketCancelled: "MarketCancelled",
  WinningsClaimed: "WinningsClaimed",
  RefundClaimed: "RefundClaimed",
  MarketLocked: "MarketLocked",
  DisputeRaised: "DisputeRaised",
  DisputeResolved: "DisputeResolved",
  FeesWithdrawn: "FeesWithdrawn",
  EmrgDrain: "EmrgDrain",
};

/**
 * Normalise an on-chain event topic to its canonical handler name.
 * Returns the canonical name if known, or undefined if unknown.
 */
export function normaliseEventType(rawType: string): string | undefined {
  return CONTRACT_TOPIC_MAP[rawType];
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SorobanEvent {
  type: string;
  contractId: string;
  ledger: number;
  ledgerClosedAt: string;
  body: Record<string, unknown>;
  txHash: string;
}

export interface LedgerData {
  sequence: number;
  closedAt: string;
  events: SorobanEvent[];
}

// ─────────────────────────────────────────────────────────────────────────────
// startIndexer: Subscribe to Soroban RPC events for all three contracts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bootstraps the blockchain event listener.
 * Connects to Stellar Soroban RPC from env config.
 * Subscribes to ALL contract events — the event handlers (switch/case)
 * filter what's relevant. This ensures Market contract events are never
 * missed, even across restarts (no in-memory registry to lose).
 * Writes raw events to EventLog before any downstream processing.
 * Reconnects with exponential backoff on RPC disconnect.
 * Long-lived process — run as a background worker.
 */
// ─────────────────────────────────────────────────────────────────────────────
// B-55: Graceful-shutdown support
// ─────────────────────────────────────────────────────────────────────────────

/** Set to true by stopIndexer() to break the polling loop cleanly. */
let _stopRequested = false;

/** Promise that resolves once the indexer loop has fully exited. */
let _stopResolve: (() => void) | null = null;
let _stopPromise: Promise<void> | null = null;

/**
 * Signal the indexer loop to stop after the current poll completes.
 * Returns a promise that resolves once the loop has fully exited.
 */
export function stopIndexer(): Promise<void> {
  if (!_stopPromise) {
    _stopPromise = new Promise<void>((resolve) => {
      _stopResolve = resolve;
    });
    _stopRequested = true;
    logger.info("Indexer stop requested");
  }
  return _stopPromise;
}

export async function startIndexer(): Promise<void> {
  _stopRequested = false;
  _stopPromise = null;

  const rpcUrl = process.env.STELLAR_RPC_URL!;
  const server = new SorobanRpc.Server(rpcUrl);

  let backoff = 1000; // ms
  const MAX_BACKOFF = 30_000;

  let fromLedger = await getLastIndexedLedger();
  logger.info({ fromLedger }, "Indexer starting");

  while (!_stopRequested) {
    try {
      logger.debug({ fromLedger }, "Polling for events");

      // Subscribe to ALL events — no contractIds filter.
      // The processLedger switch/case routes known event types and
      // logs warnings for unknowns. This avoids losing events from
      // dynamically deployed Market contracts on restart.
      const eventsResponse = await server.getEvents({
        startLedger: fromLedger + 1,
        filters: [],
        limit: 100,
      });

      // B-61: update the ledger lag gauge after each RPC poll
      // getLatestLedger() is inexpensive and returns the head ledger sequence
      try {
        const latestLedger = await server.getLatestLedger();
        indexerLedgerLag.set(Math.max(0, latestLedger.sequence - fromLedger));
      } catch {
        // Non-fatal — metrics update is best-effort
      }

      const byLedger = new Map<number, SorobanEvent[]>();
      for (const raw of eventsResponse.events) {
        const ledger = raw.ledger;
        if (!byLedger.has(ledger)) byLedger.set(ledger, []);
        byLedger.get(ledger)!.push({
          type: raw.type,
          contractId: raw.contractId as unknown as string,
          ledger: raw.ledger,
          ledgerClosedAt: raw.ledgerClosedAt,
          body: raw.value as unknown as Record<string, unknown>,
          txHash: raw.txHash,
        });
      }

      for (const [ledgerSeq, events] of [...byLedger.entries()].sort((a, b) => a[0] - b[0])) {
        // B-62: All writes (raw event persist, handler effects, cursor update)
        // happen inside a single processLedger transaction.
        await processLedger({ sequence: ledgerSeq, closedAt: events[0].ledgerClosedAt, events });

        fromLedger = ledgerSeq;
      }

      backoff = 1000;
      await sleep(5_000);
    } catch (err) {
      logger.error({ err, backoff }, "Indexer connection error — retrying with backoff");
      await sleep(backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
    }
  }

  logger.info("Indexer loop exited cleanly");
  if (_stopResolve) _stopResolve();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// IndexerState helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads the last successfully processed ledger from IndexerState table.
 * Returns 0 on a fresh start with no prior indexed state.
 */
export async function getLastIndexedLedger(): Promise<number> {
  const state = await db.indexerState.findUnique({ where: { id: 1 } });
  return state?.lastLedger ?? 0;
}

/**
 * Persists the latest processed ledger to IndexerState table.
 * Uses upsert on the singleton row (id=1) — atomic and safe across restarts.
 */
export async function saveLastIndexedLedger(ledger: number): Promise<void> {
  await db.indexerState.upsert({
    where: { id: 1 },
    update: { lastLedger: ledger },
    create: { id: 1, lastLedger: ledger },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// processLedger: single atomic DB transaction (B-62)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * B-62: Processes all contract events in a single ledger inside ONE
 * prisma.$transaction, so that:
 *   - raw EventLog upserts
 *   - all handler writes (market creates, bet records, status updates, etc.)
 *   - processedAt timestamps on EventLog rows
 *   - IndexerState cursor advance
 * all commit atomically or all roll back.
 *
 * A crash between any two of these steps leaves the DB in a consistent state:
 * on restart the indexer re-polls the same ledger, the handler upserts are
 * idempotent, and the cursor only advances on full success.
 *
 * Idempotency guarantee: each event is skipped if its EventLog row already has
 * a non-null processedAt, so retries are safe.
 */
/**
 * Processes all contract events in a single ledger.
 * Routes each event to the appropriate handler by event.type.
 * Wrapped in a Prisma interactive transaction — all handlers succeed or none persist.
 *
 * #1228 B-50: normalises raw on-chain topics via CONTRACT_TOPIC_MAP before routing.
 * Unknown events for tracked contracts are logged at error level and stored in
 * EventLog with processedAt=null so they can be replayed once a handler is added.
 *
 * Idempotency guarantee: checks EventLog for previously processed events
 * (txHash + eventType) and skips them. Marks each event as processed on success.
 * This ensures never reprocessing already-processed events on restart (Task 4).
 */
export async function processLedger(ledger: LedgerData): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const now = new Date();

    for (const event of ledger.events) {
      // ── Upsert the raw EventLog row (idempotent) ────────────────────
      await tx.eventLog.upsert({
        where: {
          txHash_eventType: {
            txHash: event.txHash,
            eventType: event.type,
          },
        },
        update: {}, // no-op on conflict — preserve original record
        create: {
          txHash: event.txHash,
          eventType: event.type,
          contractId: event.contractId,
          ledger: event.ledger,
          ledgerClosedAt: new Date(event.ledgerClosedAt),
          body: event.body as object,
        },
      });

      // ── Skip if already processed (idempotent on restart) ──────────
      const existing = await tx.eventLog.findUnique({
        where: { txHash_eventType: { txHash: event.txHash, eventType: event.type } },
        select: { processedAt: true },
      });
      if (existing?.processedAt) {
        logger.debug(
          { eventType: canonicalType, txHash: event.txHash },
          "Event already processed — skipping"
        );
        continue;
      }

      // ── Route to handler ───────────────────────────────────────────
      switch (canonicalType) {
        case "MarketCreated":
          await handleMarketCreatedEvent(normalisedEvent);
          break;
        case "BetPlaced":
          await handleBetPlacedEvent(normalisedEvent);
          break;
        case "MarketResolved":
          await handleMarketResolvedEvent(normalisedEvent);
          break;
        case "MarketCancelled":
          await handleMarketCancelledEvent(normalisedEvent);
          break;
        case "WinningsClaimed":
          await handleWinningsClaimedEvent(normalisedEvent);
          break;
        case "RefundClaimed":
          await handleRefundClaimedEvent(normalisedEvent);
          break;
        case "MarketLocked":
          await handleMarketLockedEvent(normalisedEvent);
          break;
        case "DisputeRaised":
        case "DisputeResolved":
          await handleDisputeEvent(normalisedEvent);
          break;
        default: {
          // #1228 B-50: Unknown events for tracked contracts — log at error
          // level and persist with processedAt=null for later replay.
          // The ledger cursor still advances so we don't stall the indexer.
          logger.error(
            {
              rawEventType: event.type,
              canonicalType,
              contractId: event.contractId,
              ledger: ledger.sequence,
              txHash: event.txHash,
            },
            "Unknown event type for tracked contract — stored for replay"
          );

          // Store raw event with processedAt=null so it can be replayed
          // once the handler is implemented. Uses upsert to stay idempotent.
          await db.eventLog.upsert({
            where: {
              txHash_eventType: {
                txHash: event.txHash,
                eventType: event.type,
              },
            },
            update: {}, // preserve original — do not overwrite
            create: {
              txHash: event.txHash,
              eventType: event.type,
              contractId: event.contractId,
              ledger: event.ledger,
              ledgerClosedAt: new Date(event.ledgerClosedAt),
              body: event.body,
              // processedAt intentionally left null — signals unhandled
            },
          });

          // Do NOT mark as processed — leave processedAt null for replay
          continue;
        }
      }

      // ── Mark event as processed (still inside the transaction) ─────
      await tx.eventLog.updateMany({
        where: {
          txHash: event.txHash,
          eventType: event.type,
          processedAt: null,
        },
        data: { processedAt: now },
      });
    }

    // ── Advance the cursor — only commits if all handlers succeeded ──
    await tx.indexerState.upsert({
      where: { id: 1 },
      update: { lastLedger: ledger.sequence },
      create: { id: 1, lastLedger: ledger.sequence },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// handleMarketCreatedEvent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses MarketCreated event body and calls market.service.createMarketRecord().
 * Also registers the new Market contract address for future event subscriptions.
 *
 * Expected event.body shape (from Soroban contract):
 * {
 *   market_id:       string,
 *   contractAddress: string,
 *   fighterA:        object,
 *   fighterB:        object,
 *   scheduledAt:     string | number,   // ISO string or Unix timestamp
 *   bettingEndsAt:   string | number,
 *   oracleAddress:   string,
 *   createdBy:       string,
 * }
 */
export async function handleMarketCreatedEvent(event: SorobanEvent): Promise<void> {
  const b = event.body;

  await marketService.createMarketRecord({
    id: b.market_id as string,
    contractAddress: b.contractAddress as string,
    fighterA: b.fighterA as object,
    fighterB: b.fighterB as object,
    scheduledAt: toDate(b.scheduledAt as string | number),
    bettingEndsAt: toDate(b.bettingEndsAt as string | number),
    createdAt: toDate(event.ledgerClosedAt),
    createdBy: b.createdBy as string,
    oracleAddress: b.oracleAddress as string,
    txHash: event.txHash,
  });

  logger.info({ marketId: b.market_id, ledger: event.ledger }, "MarketCreated processed");
}

// ─────────────────────────────────────────────────────────────────────────────
// handleBetPlacedEvent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses BetPlaced event body, records the bet and updates pool totals.
 *
 * Pool totals are updated atomically with bet insertion — both operations
 * execute within the same $transaction wrapping processLedger (B-62).
 *
 * Expected event.body shape:
 * {
 *   bet_id:    string,
 *   market_id: string,
 *   bettor:    string,
 *   side:      "FighterA" | "FighterB",
 *   amount:    string | number | bigint,
 *   placed_at: string | number,
 *   pool_a:    string | number | bigint,   // updated totals after this bet
 *   pool_b:    string | number | bigint,
 * }
 */
export async function handleBetPlacedEvent(event: SorobanEvent): Promise<void> {
  const b = event.body;

  // Both operations execute atomically inside the $transaction in processLedger
  await betService.recordBet({
    id: b.bet_id as string,
    marketId: b.market_id as string,
    bettor: b.bettor as string,
    side: b.side as "FighterA" | "FighterB",
    amount: toBigInt(b.amount),
    placedAt: toDate(b.placed_at as string | number),
    txHash: event.txHash,
  });

  await marketService.updateMarketPools(
    b.market_id as string,
    toBigInt(b.pool_a),
    toBigInt(b.pool_b)
  );

  publishMarketEvent(b.market_id as string, "bet_placed", {
    betId: b.bet_id,
    bettor: b.bettor,
    side: b.side,
    amount: String(toBigInt(b.amount)),
    poolA: String(toBigInt(b.pool_a)),
    poolB: String(toBigInt(b.pool_b)),
  });

  logger.info(
    { betId: b.bet_id, marketId: b.market_id, ledger: event.ledger },
    "BetPlaced processed"
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Remaining handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses MarketResolved event and calls market.service.updateMarketStatus()
 * with the final outcome decoded from the event body.
 *
 * Gracefully rejects out-of-order application: if the market doesn't exist yet
 * (market_created event hasn't been processed), throws an error so the ledger
 * transaction rolls back and the indexer retries on the next poll cycle.
 *
 * Expected event.body: { market_id, outcome: "FighterA"|"FighterB"|"Draw"|"NoContest" }
 */
export async function handleMarketResolvedEvent(event: SorobanEvent): Promise<void> {
  const b = event.body;
  const marketId = b.market_id as string;

  // Out-of-order guard — reject gracefully if market not yet created
  const market = await prisma.market.findUnique({ where: { id: marketId } });
  if (!market) {
    throw new Error(
      `Market ${marketId} not found — event arrived out of order (market_created not yet processed), will retry`
    );
  }

  await marketService.updateMarketStatus(
    marketId,
    "Resolved",
    b.outcome as "FighterA" | "FighterB" | "Draw" | "NoContest"
  );

  publishMarketEvent(b.market_id as string, "market_resolved", {
    outcome: b.outcome,
  });

  logger.info({ marketId: b.market_id, outcome: b.outcome }, "MarketResolved processed");
}

// ─────────────────────────────────────────────────────────────────────────────
// handleWinningsClaimedEvent / handleRefundClaimedEvent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses WinningsClaimed event.
 * Matches the bet by (marketId, bettor) from the event body.
 *
 * Expected event.body: { market_id, bettor, payout: string | number | bigint }
 */
export async function handleWinningsClaimedEvent(event: SorobanEvent): Promise<void> {
  const b = event.body;
  await betService.markBetClaimedByMarketAndBettor(
    b.market_id as string,
    b.bettor as string,
    toBigInt(b.payout)
  );
  logger.info({ marketId: b.market_id, bettor: b.bettor, type: event.type }, "WinningsClaimed processed");
}

/**
 * Parses RefundClaimed event.
 * Matches the bet by (marketId, bettor) from the event body.
 *
 * Expected event.body: { market_id, bettor, amount: string | number | bigint }
 */
export async function handleRefundClaimedEvent(event: SorobanEvent): Promise<void> {
  const b = event.body;
  await betService.markBetClaimedByMarketAndBettor(
    b.market_id as string,
    b.bettor as string,
    toBigInt(b.amount)
  );
  logger.info({ marketId: b.market_id, bettor: b.bettor, type: event.type }, "RefundClaimed processed");
}

// ─────────────────────────────────────────────────────────────────────────────
// handleMarketLockedEvent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses MarketLocked event and sets market status to Locked in DB.
 *
 * Expected event.body: { market_id }
 */
export async function handleMarketLockedEvent(event: SorobanEvent): Promise<void> {
  const b = event.body;
  await marketService.updateMarketStatus(b.market_id as string, "Locked");
  logger.info({ marketId: b.market_id }, "MarketLocked processed");
}

// ─────────────────────────────────────────────────────────────────────────────
// handleDisputeEvent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses DisputeRaised or DisputeResolved events and syncs dispute state to DB.
 *
 * DisputeRaised body:   { market_id, raised_by, reason }
 * DisputeResolved body: { market_id, resolution }
 *
 * On dispute raised: sets market status to Disputed and stores the dispute
 * reason for admin review via the Dispute table.
 */
export async function handleDisputeEvent(event: SorobanEvent): Promise<void> {
  const b = event.body;
  if (event.type === "DisputeRaised") {
    await db.dispute.create({
      data: {
        marketId: b.market_id as string,
        raisedBy: b.raised_by as string,
        reason: b.reason as string,
        raisedAt: toDate(event.ledgerClosedAt),
      },
    });
    await marketService.updateMarketStatus(b.market_id as string, "Disputed");
  } else if (event.type === "DisputeResolved") {
    await db.dispute.updateMany({
      where: { marketId: b.market_id as string, resolvedAt: null },
      data: {
        resolvedAt: toDate(event.ledgerClosedAt),
        resolution: b.resolution as string,
      },
    });
    await marketService.updateMarketStatus(b.market_id as string, "Resolved");
  }
  logger.info({ marketId: b.market_id, type: event.type }, "Dispute event processed");
}

/**
 * Parses MarketCancelled event and sets market status to Cancelled.
 *
 * Expected event.body: { market_id, reason: string }
 */
export async function handleMarketCancelledEvent(event: SorobanEvent): Promise<void> {
  const b = event.body;
  await marketService.updateMarketStatus(b.market_id as string, "Cancelled");
  logger.info({ marketId: b.market_id, reason: b.reason }, "MarketCancelled processed");
}


/**
 * Replays a ledger range to catch events missed during downtime.
 * All handlers use upsert patterns so replays create no duplicates.
 */
export async function recoverMissedEvents(
  fromLedger: number,
  toLedger: number
): Promise<void> {
  const latest = await getLastIndexedLedger();
  if (fromLedger > latest) return;

  const rpcUrl = process.env.SOROBAN_RPC_URL;
  for (let seq = fromLedger; seq <= toLedger; seq++) {
    const res = await fetch(rpcUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: seq, method: "getLedgers", params: { startLedger: seq, limit: 1 } }),
    });
    const json = await res.json() as { result: { ledgers: LedgerData[] } };
    const ledger = json.result.ledgers[0];
    if (ledger) await processLedger(ledger);
    if ((seq - fromLedger + 1) % 100 === 0) {
      console.log(`recoverMissedEvents: processed ${seq - fromLedger + 1} ledgers (${seq}/${toLedger})`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Convert ISO string or Unix timestamp (seconds) to Date. */
function toDate(value: string | number): Date {
  if (typeof value === "number") {
    // Soroban timestamps are Unix seconds
    return new Date(value * 1000);
  }
  return new Date(value);
}

/** Safely coerce string | number | bigint to BigInt. */
function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string") return BigInt(value);
  throw new TypeError(`Cannot convert ${typeof value} to BigInt`);
}
