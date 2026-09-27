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
      const canonicalType = normaliseEventType(event.type);

      // Persist raw event first (idempotent upsert on txHash + type)
      const existing = await tx.eventLog.findFirst({
        where: { txHash: event.txHash, eventType: event.type },
      });

      if (existing?.processedAt) {
        logger.debug(
          { txHash: event.txHash, eventType: event.type, ledger: event.ledger },
          "Skipping already-processed event",
        );
        continue;
      }

      const eventLog = existing
        ? existing
        : await tx.eventLog.create({
            data: {
              txHash: event.txHash,
              eventType: event.type,
              ledger: event.ledger,
              payload: event.body as object,
            },
          });

      if (!canonicalType) {
        logger.warn(
          { txHash: event.txHash, eventType: event.type, ledger: event.ledger },
          "Unknown event type — stored but not processed",
        );
        continue;
      }

      try {
        await handleEvent(canonicalType, event, tx);

        await tx.eventLog.update({
          where: { id: eventLog.id },
          data: { processedAt: new Date() },
        });
      } catch (err) {
        logger.error(
          { err, txHash: event.txHash, eventType: event.type, ledger: event.ledger },
          "Failed to process event",
        );
        throw err;
      }
    }

    await tx.indexerState.upsert({
      where: { id: 1 },
      update: { lastLedger: data.sequence },
      create: { id: 1, lastLedger: data.sequence },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// handleEvent: routes canonical event types to their handlers
// ─────────────────────────────────────────────────────────────────────────────

async function handleEvent(
  canonicalType: string,
  event: SorobanEvent,
  tx: PrismaClient,
): Promise<void> {
  const body = event.body as Record<string, any>;
  const marketId = body.marketId ?? body.market_id;

  switch (canonicalType) {
    case "MarketCreated": {
      logger.info(
        { marketId, txHash: event.txHash, ledger: event.ledger },
        "Handling MarketCreated",
      );
      await marketService.createMarket(body, tx);
      break;
    }

    case "BetPlaced": {
      logger.info(
        { marketId, txHash: event.txHash, ledger: event.ledger },
        "Handling BetPlaced",
      );
      await betService.recordBet(body, tx);
      break;
    }

    case "MarketResolved": {
      logger.info(
        { marketId, txHash: event.txHash, ledger: event.ledger },
        "Handling MarketResolved",
      );
      await marketService.resolveMarket(body, tx);
      break;
    }

    case "MarketCancelled": {
      logger.info(
        { marketId, txHash: event.txHash, ledger: event.ledger },
        "Handling MarketCancelled",
      );
      await marketService.cancelMarket(body, tx);
      break;
    }

    case "WinningsClaimed": {
      logger.info(
        { marketId, txHash: event.txHash, ledger: event.ledger },
        "Handling WinningsClaimed",
      );
      await markBetClaimed(body, tx);
      break;
    }

    case "RefundClaimed": {
      logger.info(
        { marketId, txHash: event.txHash, ledger: event.ledger },
        "Handling RefundClaimed",
      );
      await betService.markBetRefunded(body, tx);
      break;
    }

    case "MarketLocked": {
      logger.info(
        { marketId, txHash: event.txHash, ledger: event.ledger },
        "Handling MarketLocked",
      );
      await marketService.lockMarket(body, tx);
      break;
    }

    case "DisputeRaised": {
      logger.info(
        { marketId, txHash: event.txHash, ledger: event.ledger },
        "Handling DisputeRaised",
      );
      await marketService.raiseDispute(body, tx);
      break;
    }

    case "DisputeResolved": {
      logger.info(
        { marketId, txHash: event.txHash, ledger: event.ledger },
        "Handling DisputeResolved",
      );
      await marketService.resolveDispute(body, tx);
      break;
    }

    case "FeesWithdrawn":
    case "EmrgDrain": {
      logger.info(
        { marketId, txHash: event.txHash, ledger: event.ledger, eventType: canonicalType },
        "Event stored (no handler yet)",
      );
      break;
    }

    default: {
      logger.warn(
        { marketId, txHash: event.txHash, ledger: event.ledger, eventType: canonicalType },
        "Unhandled canonical event type",
      );
      break;
    }
  }

  // Publish to in-process event bus for downstream consumers (websockets, etc.)
  publishMarketEvent(canonicalType, { ...body, txHash: event.txHash, ledger: event.ledger });
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma client (singleton)
// ─────────────────────────────────────────────────────────────────────────────

const db = new PrismaClient();
