/**
 * B-135 (#1571): platform-wide totals for GET /api/stats.
 *
 * Totals are computed with aggregate queries, not by paging through markets.
 * The result is cached in Redis for STATS_CACHE_TTL_SECONDS, so the endpoint
 * costs at most one set of aggregates per TTL. BigInt values are returned as
 * decimal strings.
 *
 * Index notes: openMarkets uses Market(status, scheduledAt) and the
 * distinct-bettor count uses Bet(bettor, placedAt). Market and Bet sums scan
 * the table, which the cache amortises.
 */
import { db } from "../db";
import { logger } from "../logger";
import { redis } from "../lib/redis";

export const STATS_CACHE_KEY = "stats:platform";
export const STATS_CACHE_TTL_SECONDS = 30;

export interface PlatformStats {
  totalVolume: string;
  totalPaidOut: string;
  totalMarkets: number;
  openMarkets: number;
  uniqueBettors: number;
}

interface StatsClient {
  market: {
    aggregate(args: unknown): Promise<{
      _sum: { totalPool: bigint | null };
      _count: { _all: number };
    }>;
    count(args: { where: { status: "Open" } }): Promise<number>;
  };
  bet: {
    aggregate(args: unknown): Promise<{ _sum: { payout: bigint | null } }>;
  };
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/** Runs the aggregates directly against the database, bypassing the cache. */
export async function computePlatformStats(client: StatsClient = db as unknown as StatsClient): Promise<PlatformStats> {
  const [marketTotals, openMarkets, betTotals, bettorRows] = await Promise.all([
    client.market.aggregate({ _sum: { totalPool: true }, _count: { _all: true } }),
    client.market.count({ where: { status: "Open" } }),
    client.bet.aggregate({ _sum: { payout: true } }),
    client.$queryRaw<Array<{ count: number }>>`SELECT COUNT(DISTINCT "bettor")::int AS count FROM "Bet"`,
  ]);

  return {
    totalVolume: (marketTotals._sum.totalPool ?? 0n).toString(),
    totalPaidOut: (betTotals._sum.payout ?? 0n).toString(),
    totalMarkets: marketTotals._count._all,
    openMarkets,
    uniqueBettors: Number(bettorRows[0]?.count ?? 0),
  };
}

/**
 * Returns cached platform stats when present, otherwise computes and caches them.
 * A Redis failure falls through to the database; it never fails the request.
 */
export async function getPlatformStats(client?: StatsClient): Promise<PlatformStats> {
  try {
    const cached = await redis.get(STATS_CACHE_KEY);
    if (cached) return JSON.parse(cached) as PlatformStats;
  } catch (err) {
    logger.warn({ err }, "Platform stats cache read failed");
  }

  const stats = await computePlatformStats(client);

  try {
    await redis.set(STATS_CACHE_KEY, JSON.stringify(stats), "EX", STATS_CACHE_TTL_SECONDS);
  } catch (err) {
    logger.warn({ err }, "Platform stats cache write failed");
  }

  return stats;
}
