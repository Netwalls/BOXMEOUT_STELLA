import Redis from "ioredis";
import { db as prisma } from "../db";
import { guardRedis } from "../lib/redis-guard";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

const CACHE_TTL = 10; // seconds

export interface SearchResult {
  data: Record<string, unknown>[];
  total: number;
}

/**
 * Full-text search across question + description using tsvector.
 * Uses websearch_to_tsquery, which accepts quoted phrases, "or" and "-" and
 * never raises a syntax error on arbitrary user input. q is always a bound
 * parameter. Results are sorted by relevance and cached in Redis for 10 s.
 */
export async function searchMarkets(
  q: string,
  page = 1,
  limit = 20
): Promise<SearchResult> {
  const cacheKey = `search:${q}:${page}:${limit}`;
  // Cache reads and writes are best-effort: if Redis is unavailable, search falls back to Postgres (#1590).
  const cached = await guardRedis<string | null>("market_cache", () => redis.get(cacheKey), null);
  if (cached) return JSON.parse(cached) as SearchResult;

  const offset = (page - 1) * limit;

  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT *, ts_rank("tsVector", websearch_to_tsquery('english', ${q})) AS rank
      FROM "Market"
      WHERE "tsVector" @@ websearch_to_tsquery('english', ${q})
      ORDER BY rank DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count
      FROM "Market"
      WHERE "tsVector" @@ websearch_to_tsquery('english', ${q})
    `,
  ]);

  const result: SearchResult = {
    data: rows,
    total: Number(countRows[0].count),
  };

  await guardRedis("market_cache", () => redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result)), undefined);
  return result;
}
