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
// #1246 B-68 — Cache invalidation on chain events
//
// The frontend polls /api/markets/:id/stats every 4s per viewer, and the
// market list is read on every page load. Both are cached in Redis with a
// short TTL (see market.service). Whenever the indexer applies a write that
// changes a market's state (a bet, a status transition, a claim), the
// corresponding cache keys must be dropped so the next read repopulates them
// with fresh data instead of serving a stale snapshot for up to the TTL.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical event types that mutate a market's stats and/or list entry.
 * Any of these invalidates the per-market stats key and the list keys.
 */
const MARKET_MUTATING_EVENTS = new Set<string>([
  "BetPlaced",
  "MarketCreated",
  "MarketResolved",
  "MarketCancelled",
  "MarketLocked",
  "WinningsClaimed",
  "RefundClaimed",
  "DisputeRaised",
  "DisputeResolved",
]);

/**
 * Best-effort cache invalidation for a single processed event.
 * Never throws — a Redis hiccup must not roll back the ledger transaction
 * or stall the indexer. Failures are logged and the short TTL bounds staleness.
 */
async function invalidateMarketCacheForEvent(
  canonicalType: string,
  marketId: string | undefined,
): Promise<void> {
  if (!MARKET_MUTATING_EVENTS.has(canonicalType)) return;
  try {
    await marketService.invalidateMarketCache(marketId);
    logger.debug({ canonicalType, marketId }, "Invalidated market cache");
  } catch (err) {
    logger.warn({ err, canonicalType, marketId }, "Market cache invalidation failed");
  }
}

/**
 * Extracts the market id from a decoded event body. Contract events carry the
 * market id under a few different field names depending on the emitter; we
 * check the common ones and fall back to undefined (which invalidates the
 * list keys only).
 */
function extractMarketId(body: Record<string, unknown>): string | undefined {
  const candidate = body.marketId ?? body.market_id ?? body.id;
  return typeof candidate === "string" ? candidate : undefined;
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
export async function startIndexer(): Promise<void> {
  const rpcUrl = process.env.STELLAR_RPC_URL!;
  const server = new SorobanRpc.Server(rpcUrl);

  let backoff = 1000; // ms
  const MAX_BACKOFF = 30_000;

  let fromLedger = await getLastIndexedLedger();
  logger.info({ fromLedger }, "Indexer starting");

  while (true) {
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

        // B-68: Invalidate market cache AFTER the ledger transaction commits,
        // so we never drop a key for a write that later rolls back. This runs
        // outside the transaction and is best-effort (see helper above).
        for (const event of events) {
          const canonicalType = normaliseEventType(event.type);
          if (!canonicalType) continue;
          await invalidateMarketCacheForEvent(canonicalType, extractMarketId(event.body));
        }

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
export async function processLedger(data: LedgerData): Promise<void> {
  await db.$transaction(async (tx) => {
    for (const event of data.events) {
      const existing = await tx.eventLog.findUnique({ where: { txHash: event.txHash } });
      if (existing?.processedAt) continue;

      await tx.eventLog.upsert({
        where: { txHash: event.txHash },
        update: { processedAt: new Date() },
        create: {
          txHash: event.txHash,
          type: event.type,
          contractId: event.contractId,
          ledger: event.ledger,
          ledgerClosedAt: new Date(event.ledgerClosedAt),
          body: event.body as object,
          processedAt: new Date(),
        },
      });

      await handleEvent(event, tx);
    }

    await tx.indexerState.upsert({
      where: { id: 1 },
      update: { lastLedger: data.sequence },
      create: { id: 1, lastLedger: data.sequence },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// handleEvent: routes a single event to its handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleEvent(event: SorobanEvent, tx: PrismaClient): Promise<void> {
  const canonicalType = normaliseEventType(event.type);
  if (!canonicalType) {
    logger.warn({ type: event.type }, "Unknown event type — stored but not handled");
    return;
  }

  switch (canonicalType) {
    case "MarketCreated":
      await marketService.handleMarketCreated(event.body, tx);
      break;
    case "BetPlaced":
      await betService.handleBetPlaced(event.body, tx);
      break;
    case "MarketResolved":
    case "MarketCancelled":
    case "MarketLocked":
      await marketService.handleMarketStatusChange(canonicalType, event.body, tx);
      break;
    case "WinningsClaimed":
      await markBetClaimed(event.body, tx);
      break;
    case "RefundClaimed":
      await betService.handleRefundClaimed(event.body, tx);
      break;
    case "DisputeRaised":
    case "DisputeResolved":
      await marketService.handleDisputeEvent(canonicalType, event.body, tx);
      break;
    case "FeesWithdrawn":
    case "EmrgDrain":
      logger.info({ canonicalType, txHash: event.txHash }, "Admin event observed");
      break;
    default:
      logger.warn({ canonicalType }, "Unhandled canonical event type");
  }

  publishMarketEvent(canonicalType, event.body);
}
