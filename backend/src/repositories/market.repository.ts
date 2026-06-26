import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

const CACHE_TTL = 10; // seconds

export interface SearchResult {
  data: Record<string, unknown>[];
  total: number;
}

/**
 * Full-text search across question + description using tsvector.
 * Results are sorted by relevance and cached in Redis for 10 s.
 */
export async function searchMarkets(
  q: string,
  page = 1,
  limit = 20
): Promise<SearchResult> {
  const cacheKey = `search:${q}:${page}:${limit}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as SearchResult;

  const offset = (page - 1) * limit;

  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT *, ts_rank("tsVector", plainto_tsquery('english', ${q})) AS rank
      FROM "Market"
      WHERE "tsVector" @@ plainto_tsquery('english', ${q})
      ORDER BY rank DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count
      FROM "Market"
      WHERE "tsVector" @@ plainto_tsquery('english', ${q})
    `,
  ]);

  const result: SearchResult = {
    data: rows,
    total: Number(countRows[0].count),
  };

  await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
  return result;
}
