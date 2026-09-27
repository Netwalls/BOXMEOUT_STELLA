import { Market, MarketStatus, Outcome } from "@prisma/client";
import {
  SorobanRpc,
  TransactionBuilder,
  Networks,
  Contract,
  Keypair,
  BASE_FEE,
  scValToNative,
} from "@stellar/stellar-sdk";
import { db } from "../db";
import { logger } from "../logger";
import { redis } from "../redis";

export interface MarketFilters {
  status?: MarketStatus;
  weightClass?: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const MAX_PAGE_SIZE = 100;

/**
 * Short TTL (seconds) for cached market list and stats responses.
 * Kept small so the 4s frontend poll still sees fresh data while
 * absorbing bursts of concurrent viewers.
 */
export const MARKET_CACHE_TTL_SECONDS = 5;

const MARKET_LIST_CACHE_PREFIX = "market:list:";
const MARKET_STATS_CACHE_PREFIX = "market:stats:";

// Cache hit/miss counters used to log the hit ratio.
let cacheHits = 0;
let cacheMisses = 0;

function logCacheHitRatio(): void {
  const total = cacheHits + cacheMisses;
  if (total === 0) return;
  logger.info(
    {
      cacheHits,
      cacheMisses,
      hitRatio: Number((cacheHits / total).toFixed(4)),
    },
    "Market cache hit ratio"
  );
}

function recordCacheHit(): void {
  cacheHits += 1;
  logCacheHitRatio();
}

function recordCacheMiss(): void {
  cacheMisses += 1;
  logCacheHitRatio();
}

function listCacheKey(filters?: MarketFilters, pagination?: Pagination): string {
  const status = filters?.status ?? "all";
  const weightClass = filters?.weightClass ?? "all";
  const page = pagination?.page ?? 1;
  const pageSize = Math.min(pagination?.pageSize ?? 20, MAX_PAGE_SIZE);
  return `${MARKET_LIST_CACHE_PREFIX}${status}:${weightClass}:${page}:${pageSize}`;
}

function statsCacheKey(marketId: string): string {
  return `${MARKET_STATS_CACHE_PREFIX}${marketId}`;
}

/**
 * Invalidates cached market list and stats entries.
 * Called by the indexer on BetPlaced and market status events so the
 * next poll re-reads fresh data from Postgres.
 */
export async function invalidateMarketCache(marketId?: string): Promise<void> {
  try {
    const keys: string[] = [];
    if (marketId) {
      keys.push(statsCacheKey(marketId));
    }

    // Invalidate all list variants (status/weightClass/page/pageSize combos).
    const listKeys = await redis.keys(`${MARKET_LIST_CACHE_PREFIX}*`);
    keys.push(...listKeys);

    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    logger.warn({ err, marketId }, "Failed to invalidate market cache");
  }
}

export interface MarketStats {
  totalBets: number;
  uniqueBettors: number;
  poolA: bigint;
  poolB: bigint;
  totalVolume: bigint;
  impliedOddsA: number;
  impliedOddsB: number;
}

export interface LeaderboardEntry {
  bettor: string;
  totalStaked: bigint;
  betCount: number;
}

export interface CreateMarketDTO {
  id: string;
  contractAddress: string;
  fighterA: object;
  fighterB: object;
  scheduledAt: Date;
  bettingEndsAt: Date;
  createdAt: Date;
  createdBy: string;
  oracleAddress: string;
  txHash?: string;
}

const PROTOCOL_FEE_RATE = 0.02; // 2% protocol fee

/**
 * Calculates the implied odds (payout multiplier) for each side.
 * Formula: (total_pool - fee) / pool_side
 * Returns 0 if pool_side is zero to avoid division by zero.
 */
export function calculateImpliedOdds(
  poolA: bigint,
  poolB: bigint
): { impliedOddsA: number; impliedOddsB: number } {
  const total = poolA + poolB;
  if (total === 0n) return { impliedOddsA: 0, impliedOddsB: 0 };

  const netPool = Number(total) * (1 - PROTOCOL_FEE_RATE);
  const impliedOddsA = poolA > 0n ? netPool / Number(poolA) : 0;
  const impliedOddsB = poolB > 0n ? netPool / Number(poolB) : 0;

  return { impliedOddsA, impliedOddsB };
}

export async function getAllMarkets(
  filters?: MarketFilters,
  pagination?: Pagination
): Promise<Market[]> {
  const cacheKey = listCacheKey(filters, pagination);

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      recordCacheHit();
      return JSON.parse(cached) as Market[];
    }
  } catch (err) {
    logger.warn({ err, cacheKey }, "Market list cache read failed");
  }

  recordCacheMiss();

  const where: Record<string, unknown> = {};

  if (filters?.status) {
    where.status = filters.status;
  }
  if (filters?.weightClass) {
    where.weightClass = filters.weightClass;
  }

  const page = pagination?.page ?? 1;
  const limit = Math.min(pagination?.pageSize ?? 20, MAX_PAGE_SIZE);

  const markets = await db.market.findMany({
    where,
    orderBy: { scheduledAt: "asc" },
    skip: (page - 1) * limit,
    take: limit,
  });

  try {
    await redis.set(
      cacheKey,
      JSON.stringify(markets),
      "EX",
      MARKET_CACHE_TTL_SECONDS
    );
  } catch (err) {
    logger.warn({ err, cacheKey }, "Market list cache write failed");
  }

  return markets;
}

/**
 * Single-market lookup by marketId.
 * Returns null for unknown IDs (not a thrown error).
 */
export async function getMarketById(market_id: string): Promise<Market | null> {
  return db.market.findUnique({ where: { id: market_id } });
}

/**
 * Creates or updates a market record from an indexed MarketCreated event.
 *
 * If an optimistic row exists with a matching txHash, it reconciles by:
 * 1. Deleting the optimistic row (which used txHash as its id)
 * 2. Upserting with the real on-chain market_id
 *
 * The entire reconciliation runs inside an interactive Prisma transaction
 * to avoid race conditions with concurrent indexer or API calls.
 */
export async function createMarketRecord(
  marketData: CreateMarketDTO
): Promise<Market> {
  return db.$transaction(async (tx) => {
    // Check for an existing optimistic row matched by txHash (inside txn)
    if (marketData.txHash) {
      const optimistic = await tx.market.findUnique({
        where: { id: marketData.txHash },
      });

      if (optimistic) {
        // Atomically delete the optimistic row and create the real one
        await tx.market.delete({ where: { id: marketData.txHash } });
        const market = await tx.market.create({
          data: {
            id: marketData.id,
            contractAddress: marketData.contractAddress,
            fighterA: marketData.fighterA,
            fighterB: marketData.fighterB,
            scheduledAt: marketData.scheduledAt,
            bettingEndsAt: marketData.bettingEndsAt,
            createdAt: marketData.createdAt,
            createdBy: marketData.createdBy,
            oracleAddress: marketData.oracleAddress,
            txHash: marketData.txHash,
            status: "Open",
          },
        });
        logger.info(
          { marketId: marketData.id, txHash: marketData.txHash },
          "Reconciled optimistic market row with on-chain event"
        );
        return market;
      }
    }

    // Standard upsert path — no optimistic row to reconcile
    return tx.market.upsert({
      where: { id: marketData.id },
      update: {
        // Backfill txHash if it was missing on a previous create
        ...(marketData.txHash ? { txHash: marketData.txHash } : {}),
      },
      create: {
        id: marketData.id,
        contractAddress: marketData.contractAddress,
        fighterA: marketData.fighterA,
        fighterB: marketData.fighterB,
        scheduledAt: marketData.scheduledAt,
        bettingEndsAt: marketData.bettingEndsAt,
        createdAt: marketData.createdAt,
        createdBy: marketData.createdBy,
        oracleAddress: marketData.oracleAddress,
        txHash: marketData.txHash,
        status: "Open",
      },
    });
  });
}

/**
 * Fallback reconciliation that re-reads a market's state directly from Soroban RPC.
 * Used when cached data is suspected stale (e.g. admin "force refresh" action).
 * Overwrites the DB row with on-chain truth.
 *
 * Calls the contract's get_market_info() function via a simulated transaction
 * and maps the decoded result to DB columns.
 */
export async function reconcileMarketFromChain(
  marketId: string
): Promise<Market> {
  const market = await db.market.findUnique({ where: { id: marketId } });
  if (!market) {
    throw Object.assign(new Error(`Market not found: ${marketId}`), {
      code: "NOT_FOUND",
    });
  }

  const rpcUrl = process.env.STELLAR_RPC_URL;
  if (!rpcUrl) {
    throw new Error("STELLAR_RPC_URL environment variable is not set");
  }

  const server = new SorobanRpc.Server(rpcUrl);
  const contract = new Contract(market.contractAddress);

  // Use a throwaway keypair as the source account for read-only simulation.
  // The simulation doesn't require a real account with funds — any valid
  // keypair works because the tx is never submitted to the network.
  const throwawayKeypair = Keypair.random();
  const networkPassphrase =
    process.env.STELLAR_NETWORK === "mainnet"
      ? Networks.PUBLIC
      : Networks.TESTNET;

  // Build a minimal transaction for simulating the get_market_info() call
  const account = await server.getAccount(throwawayKeypair.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call("get_market_info"))
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(
      `Simulation error for market ${marketId}: ${JSON.stringify(simResult)}`
    );
  }

  if (!simResult.result?.retval) {
    throw new Error(`Empty simulation result for market ${marketId}`);
  }

  // Convert the ScVal return value to a native JS object.
  // The Market struct fields become object properties.
  const raw = scValToNative(simResult.result.retval) as Record<string, unknown>;

  // Map contract MarketStatus to DB MarketStatus enum
  const statusMap: Record<string, MarketStatus> = {
    Open: "Open",
    Locked: "Locked",
    Resolved: "Resolved",
    Cancelled: "Cancelled",
    Disputed: "Disputed",
  };

  // The contract uses Soroban enums where scValToNative returns { name: "Open" } etc.
  const contractStatus: string =
    typeof raw?.status === "object" && raw?.status !== null
      ? String((raw.status as Record<string, unknown>)?.name ?? "Open")
      : String(raw?.status ?? "Open");

  // Map outcome if present (also a Soroban enum)
  let outcome: Outcome | undefined;
  if (raw?.outcome && typeof raw.outcome === "object") {
    const outcomeName = String(
      (raw.outcome as Record<string, unknown>)?.name ?? ""
    );
    if (["FighterA", "FighterB", "Draw", "NoContest"].includes(outcomeName)) {
      outcome = outcomeName as Outcome;
    }
  }

  const updated = await db.market.update({
    where: { id: marketId },
    data: {
      status: statusMap[contractStatus] ?? market.status,
      ...(outcome ? { outcome } : {}),
    },
  });

  // On-chain truth changed — drop any cached list/stats for this market.
  await invalidateMarketCache(marketId);

  return updated;
}
