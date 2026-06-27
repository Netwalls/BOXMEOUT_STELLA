import { PrismaClient } from "@prisma/client";
import pino from "pino";

import * as marketService from "./market.service";
import * as betService from "./bet.service";

const prisma = new PrismaClient();
const logger = pino({ name: "indexer" });

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
import { SorobanRpc } from "@stellar/stellar-sdk";

const prisma = new PrismaClient();
import { markBetClaimed } from "./bet.service";

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
// Issue 1 — IndexerState: getLastIndexedLedger / saveLastIndexedLedger
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Bootstraps the blockchain event listener.
 * Connects to Stellar Horizon/Soroban RPC from env config.
 * Registers all event handlers and polls from last indexed ledger.
 * Long-lived process — run as a background worker.
 */
export async function startIndexer(): Promise<void> {
  const rpcUrl = process.env.STELLAR_RPC_URL!;
  const contractId = process.env.MARKET_FACTORY_CONTRACT_ID!;
  const server = new SorobanRpc.Server(rpcUrl);

  let backoff = 1000; // ms
  const MAX_BACKOFF = 30_000;

  let fromLedger = await getLastIndexedLedger();
  console.log(`[indexer] Starting from ledger ${fromLedger}`);

  while (true) {
    try {
      const eventsResponse = await server.getEvents({
        startLedger: fromLedger + 1,
        filters: [{ contractIds: [contractId] }],
        limit: 100,
      });

      const byLedger = new Map<number, SorobanEvent[]>();
      for (const raw of eventsResponse.events) {
        const ledger = raw.ledger;
        if (!byLedger.has(ledger)) byLedger.set(ledger, []);
        byLedger.get(ledger)!.push({
          type: raw.type,
          contractId: raw.contractId,
          ledger: raw.ledger,
          ledgerClosedAt: raw.ledgerClosedAt,
          body: raw.value as Record<string, unknown>,
          txHash: raw.txHash,
        });
      }

      for (const [ledgerSeq, events] of [...byLedger.entries()].sort((a, b) => a[0] - b[0])) {
        await processLedger({ sequence: ledgerSeq, closedAt: events[0].ledgerClosedAt, events });
        await saveLastIndexedLedger(ledgerSeq);
        fromLedger = ledgerSeq;
      }

      backoff = 1000;
      await sleep(5_000);
    } catch (err) {
      console.error(`[indexer] Connection error (retrying in ${backoff}ms):`, err);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reads the last successfully processed ledger from IndexerState table.
 * Returns 0 on a fresh start with no prior indexed state.
 */
export async function getLastIndexedLedger(): Promise<number> {
  const state = await prisma.indexerState.findUnique({ where: { id: 1 } });
  return state?.lastLedger ?? 0;
}

/**
 * Persists the latest processed ledger to IndexerState table.
 * Uses upsert on the singleton row (id=1) — atomic and safe across restarts.
 */
export async function saveLastIndexedLedger(ledger: number): Promise<void> {
  await prisma.indexerState.upsert({
    where: { id: 1 },
    update: { lastLedger: ledger },
    create: { id: 1, lastLedger: ledger },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Issue 2 — processLedger: route events + DB transaction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Processes all contract events in a single ledger.
 * Routes each event to the appropriate handler by event.type.
 * Wrapped in a Prisma interactive transaction — all handlers succeed or none persist.
 */
export async function processLedger(ledger: LedgerData): Promise<void> {
  await prisma.$transaction(async () => {
    for (const event of ledger.events) {
      switch (event.type) {
        case "MarketCreated":
          await handleMarketCreatedEvent(event);
          break;
        case "BetPlaced":
          await handleBetPlacedEvent(event);
          break;
        case "MarketResolved":
          await handleMarketResolvedEvent(event);
          break;
        case "WinningsClaimed":
        case "RefundClaimed":
          await handleWinnersClaimedEvent(event);
          break;
        case "MarketLocked":
          await handleMarketLockedEvent(event);
          break;
        case "DisputeRaised":
        case "DisputeResolved":
          await handleDisputeEvent(event);
          break;
        default:
          logger.warn(
            { eventType: event.type, ledger: ledger.sequence },
            "Unknown event type — skipping"
          );
          break;
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Issue 3 — handleMarketCreatedEvent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses MarketCreated event body and calls market.service.createMarketRecord().
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
// Issue 4 — handleBetPlacedEvent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses BetPlaced event body, records the bet and updates pool totals.
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

  logger.info(
    { betId: b.bet_id, marketId: b.market_id, ledger: event.ledger },
    "BetPlaced processed"
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Remaining handlers (stubs for completeness — not part of the four issues)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses MarketResolved event and calls market.service.updateMarketStatus()
 * with the final outcome decoded from the event body.
 *
 * Expected event.body: { market_id, outcome: "FighterA"|"FighterB"|"Draw"|"NoContest" }
 */
export async function handleMarketResolvedEvent(event: SorobanEvent): Promise<void> {
  const b = event.body;
  await marketService.updateMarketStatus(
    b.market_id as string,
    "Resolved",
    b.outcome as "FighterA" | "FighterB" | "Draw" | "NoContest"
  );
  logger.info({ marketId: b.market_id, outcome: b.outcome }, "MarketResolved processed");
}

/**
 * Parses WinningsClaimed or RefundClaimed event.
 * Calls bet.service.markBetClaimed() with the payout amount.
 *
 * Expected event.body: { bet_id, payout: string | number | bigint }
 */
export async function handleWinnersClaimedEvent(event: SorobanEvent): Promise<void> {
  const b = event.body;
  await betService.markBetClaimed(b.bet_id as string, toBigInt(b.payout));
  logger.info({ betId: b.bet_id, type: event.type }, "Claim processed");
  const { bet_id, payout } = event.body as { bet_id: string; bettor: string; payout: string };
  await markBetClaimed(bet_id, BigInt(payout));
}

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

/**
 * Parses DisputeRaised or DisputeResolved events and syncs dispute state to DB.
 *
 * DisputeRaised body:   { market_id, raised_by, reason }
 * DisputeResolved body: { market_id, resolution }
 */
export async function handleDisputeEvent(event: SorobanEvent): Promise<void> {
  const b = event.body;
  if (event.type === "DisputeRaised") {
    await prisma.dispute.create({
      data: {
        marketId: b.market_id as string,
        raisedBy: b.raised_by as string,
        reason: b.reason as string,
        raisedAt: toDate(event.ledgerClosedAt),
      },
    });
  } else if (event.type === "DisputeResolved") {
    await prisma.dispute.updateMany({
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
 * Bootstraps the blockchain event listener.
 * Connects to Stellar Soroban RPC, polls from last indexed ledger.
 * Long-lived process — run as a background worker.
 */
export async function startIndexer(): Promise<void> {
  throw new Error("Not implemented");
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
