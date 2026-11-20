/**
 * B-136 (#1572): trending markets, ranked by stake placed in a recent window.
 *
 * Only Open markets are ranked. Volume is the sum of Bet.amount with
 * placedAt inside the window, so a bet is counted once per market it touches.
 * Results are cached in Redis for TRENDING_CACHE_TTL_SECONDS. The logic lives
 * here rather than in market.service.ts so it can be tested in isolation.
 */
import { db } from "../db";
import { redis } from "../lib/redis";
import { logger } from "../logger";

const HOUR_MS = 60 * 60 * 1000;

export const TRENDING_WINDOWS = {
  "1h": HOUR_MS,
  "24h": 24 * HOUR_MS,
  "7d": 7 * 24 * HOUR_MS,
} as const;
export type TrendingWindow = keyof typeof TRENDING_WINDOWS;

export const TRENDING_DEFAULT_WINDOW: TrendingWindow = "24h";
export const TRENDING_DEFAULT_LIMIT = 10;
export const TRENDING_MAX_LIMIT = 50;
export const TRENDING_CACHE_TTL_SECONDS = 15;
const CACHE_PREFIX = "markets:trending:";

export interface TrendingOptions {
  window?: TrendingWindow;
  limit?: number;
}

export interface NormalisedTrendingOptions {
  window: TrendingWindow;
  limit: number;
}

/** Applies defaults and clamps limit into [1, TRENDING_MAX_LIMIT]. */
export function normaliseTrendingOptions(options: TrendingOptions = {}): NormalisedTrendingOptions {
  const window = options.window ?? TRENDING_DEFAULT_WINDOW;
  const requested = options.limit ?? TRENDING_DEFAULT_LIMIT;
  const limit = Math.min(Math.max(Math.trunc(requested), 1), TRENDING_MAX_LIMIT);
  return { window, limit };
}

export type TrendingMarket = Record<string, unknown> & { id: string; windowVolume: string };

interface TrendingClient {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  market: {
    findMany(args: { where: { id: { in: string[] } } }): Promise<Array<Record<string, unknown> & { id: string }>>;
  };
}

/** Computes the ranking against the database, without the cache. */
export async function computeTrendingMarkets(
  options: TrendingOptions = {},
  client: TrendingClient = db as unknown as TrendingClient,
  now: Date = new Date(),
): Promise<TrendingMarket[]> {
  const { window, limit } = normaliseTrendingOptions(options);
  const since = new Date(now.getTime() - TRENDING_WINDOWS[window]);

  const ranked = await client.$queryRaw<Array<{ marketId: string; windowVolume: string }>>`
    SELECT b."marketId" AS "marketId", SUM(b."amount")::text AS "windowVolume"
    FROM "Bet" b
    INNER JOIN "Market" m ON m."id" = b."marketId"
    WHERE m."status" = 'Open' AND b."placedAt" >= ${since}
    GROUP BY b."marketId"
    ORDER BY SUM(b."amount") DESC, b."marketId" ASC
    LIMIT ${limit}`;

  if (ranked.length === 0) return [];

  const markets = await client.market.findMany({
    where: { id: { in: ranked.map((row) => row.marketId) } },
  });
  const byId = new Map(markets.map((market) => [market.id, market]));

  const result: TrendingMarket[] = [];
  for (const row of ranked) {
    const market = byId.get(row.marketId);
    if (market) {
      result.push({ ...market, id: market.id, windowVolume: row.windowVolume });
    }
  }
  return result;
}

function cacheKey(options: NormalisedTrendingOptions): string {
  return `${CACHE_PREFIX}${options.window}:${options.limit}`;
}

/** Cached variant used by the HTTP handler. Redis failures fall through to the database. */
export async function getTrendingMarkets(
  options: TrendingOptions = {},
  client?: TrendingClient,
): Promise<TrendingMarket[]> {
  const normalised = normaliseTrendingOptions(options);
  const key = cacheKey(normalised);

  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as TrendingMarket[];
  } catch (err) {
    logger.warn({ err, key }, "Trending cache read failed");
  }

  const markets = await computeTrendingMarkets(normalised, client);

  try {
    // Market rows carry BigInt pool fields, which JSON.stringify rejects. Convert them to strings first.
    const serialised = JSON.stringify(markets, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );
    await redis.set(key, serialised, "EX", TRENDING_CACHE_TTL_SECONDS);
  } catch (err) {
    logger.warn({ err, key }, "Trending cache write failed");
  }

  return markets;
}
