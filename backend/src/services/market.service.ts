import { Market, MarketStatus, Outcome, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
import { Market, MarketStatus, Outcome } from "@prisma/client";
import prisma from "../lib/prisma";

export interface MarketFilters {
  status?: MarketStatus;
  weightClass?: string;
}

export interface Pagination {
  page: number;
  limit: number;
}

export interface MarketStats {
  totalBets: number;
  uniqueBettors: number;
  poolA: bigint;
  poolB: bigint;
  totalVolume: bigint;
  impliedOddsA: number; // 0-100 percentage
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

/**
 * Fetches all markets from the database with optional filters and pagination.
 * Returns results ordered by scheduledAt ascending.
 */
export async function getAllMarkets(
  filters?: MarketFilters,
  pagination?: Pagination
): Promise<Market[]> {
  const where: { status?: MarketStatus; weightClass?: string } = {};
  if (filters?.status) where.status = filters.status;
  if (filters?.weightClass) where.weightClass = filters.weightClass;

  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 20;

  return prisma.market.findMany({
    where,
    orderBy: { scheduledAt: "asc" },
    skip: (page - 1) * limit,
    take: limit,
  });
}

/**
 * Fetches a single market by its on-chain market_id.
 * Returns null if not found — does NOT throw.
 */
export async function getMarketById(market_id: string): Promise<Market | null> {
  return prisma.market.findUnique({ where: { id: market_id } });
}

/**
 * Persists a newly deployed market to the database.
 * Called by the indexer on MarketCreated event.
 * Must be idempotent — safe to call again on event replay.
 */
export async function createMarketRecord(
  marketData: CreateMarketDTO
): Promise<Market> {
  throw new Error("Not implemented");
}

/**
 * Updates a market's status and optional outcome in the database.
 * Called when the indexer detects MarketLocked, MarketResolved, or Cancelled events.
 */
export async function updateMarketStatus(
  market_id: string,
  status: MarketStatus,
  outcome?: Outcome
): Promise<Market> {
  throw new Error("Not implemented");
}

/**
 * Updates pool_a, pool_b, and total_pool after each BetPlaced event.
 * Keeps the database in sync with on-chain pool state.
 */
export async function updateMarketPools(
  market_id: string,
  pool_a: bigint,
  pool_b: bigint
): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * Returns aggregate stats: total bets, unique bettors, pool sizes, implied odds.
 */
export async function getMarketStats(market_id: string): Promise<MarketStats> {
  throw new Error("Not implemented");
}

/**
 * Returns the top bettors by stake size for a given market.
 */
export async function getMarketLeaderboard(
  market_id: string
): Promise<LeaderboardEntry[]> {
  throw new Error("Not implemented");
}
