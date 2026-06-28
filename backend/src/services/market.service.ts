import { Market, MarketStatus, Outcome, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
  impliedOddsA: number; // payout multiplier: (total_pool - fee) / pool_a
  impliedOddsB: number; // payout multiplier: (total_pool - fee) / pool_b
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

export async function getMarketById(market_id: string): Promise<Market | null> {
  return prisma.market.findUnique({ where: { id: market_id } });
}

export async function createMarketRecord(
  marketData: CreateMarketDTO
): Promise<Market> {
  const data = {
    contractAddress: marketData.contractAddress,
    fighterA: marketData.fighterA,
    fighterB: marketData.fighterB,
    scheduledAt: marketData.scheduledAt,
    bettingEndsAt: marketData.bettingEndsAt,
    createdAt: marketData.createdAt,
    createdBy: marketData.createdBy,
    oracleAddress: marketData.oracleAddress,
    txHash: marketData.txHash,
  };

  return prisma.market.upsert({
    where: { id: marketData.id },
    create: { id: marketData.id, ...data },
    update: {},
  });
}

export async function updateMarketStatus(
  market_id: string,
  status: MarketStatus,
  outcome?: Outcome
): Promise<Market> {
  return prisma.market.update({
    where: { id: market_id },
    data: {
      status,
      ...(outcome !== undefined && { outcome }),
      ...(status === MarketStatus.Resolved && { resolvedAt: new Date() }),
    },
  });
}

export async function updateMarketPools(
  market_id: string,
  pool_a: bigint,
  pool_b: bigint
): Promise<void> {
  await prisma.market.update({
    where: { id: market_id },
    data: { poolA: pool_a, poolB: pool_b, totalPool: pool_a + pool_b },
  });
}

export async function getMarketStats(market_id: string): Promise<MarketStats> {
  const market = await db.market.findUnique({
    where: { id: market_id },
    include: { bets: true },
  });

  if (!market) {
    throw Object.assign(new Error("Market not found"), { code: "NOT_FOUND" });
  }

  const totalBets = market.bets.length;
  const uniqueBettors = new Set(market.bets.map((b: any) => b.bettor)).size;
  const poolA = market.poolA;
  const poolB = market.poolB;
  const totalVolume = market.totalPool;

  const impliedOddsA =
    totalVolume > 0n
      ? Number((poolA * 10000n) / totalVolume) / 100
      : 50;
  const impliedOddsB =
    totalVolume > 0n
      ? Number((poolB * 10000n) / totalVolume) / 100
      : 50;

  return { totalBets, uniqueBettors, poolA, poolB, totalVolume, impliedOddsA, impliedOddsB };
}

export async function getMarketLeaderboard(
  market_id: string
): Promise<LeaderboardEntry[]> {
  throw new Error("Not implemented");
}
