import { Market, MarketStatus } from "@prisma/client";
import { db } from "../db";
import { logger } from "../logger";
import { redis } from "../lib/redis";
import {
  buildMarketOrderBy,
  type MarketSort,
  type SortOrder,
} from "./market-sort";

/**
 * Market list query (B-122 #1558 sorting/category filter). Split out of
 * market.service.ts so the list path has no dependency on the rest of that module.
 */

export interface MarketFilters {
  status?: MarketStatus;
  weightClass?: string;
  categoryId?: string;
}

export interface Pagination {
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

export const MARKET_LIST_CACHE_PREFIX = "market:list:";
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

function listCacheKey(
  filters?: MarketFilters,
  pagination?: Pagination,
  sort: MarketSort = "soonest",
  order: SortOrder = "asc"
): string {
  const status = filters?.status ?? "all";
  const weightClass = filters?.weightClass ?? "all";
  const categoryId = filters?.categoryId ?? "all";
  const page = pagination?.page ?? 1;
  const pageSize = Math.min(pagination?.pageSize ?? 20, MAX_PAGE_SIZE);
  return `${MARKET_LIST_CACHE_PREFIX}${status}:${weightClass}:${categoryId}:${sort}:${order}:${page}:${pageSize}`;
}

export interface MarketPage {
  data: Market[];
  total: number;
}

export async function getAllMarkets(
  filters?: MarketFilters,
  pagination?: Pagination,
  sort: MarketSort = "soonest",
  order: SortOrder = "asc"
): Promise<MarketPage> {
  const cacheKey = listCacheKey(filters, pagination, sort, order);

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      recordCacheHit();
      return JSON.parse(cached) as MarketPage;
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
  if (filters?.categoryId) {
    where.categoryId = filters.categoryId;
  }

  const page = pagination?.page ?? 1;
  const limit = Math.min(pagination?.pageSize ?? 20, MAX_PAGE_SIZE);

  const [markets, total] = await Promise.all([
    db.market.findMany({
      where,
      orderBy: buildMarketOrderBy(sort, order),
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.market.count({ where }),
  ]);

  const result: MarketPage = { data: markets, total };

  try {
    await redis.set(
      cacheKey,
      JSON.stringify(result),
      "EX",
      MARKET_CACHE_TTL_SECONDS
    );
  } catch (err) {
    logger.warn({ err, cacheKey }, "Market list cache write failed");
  }

  return result;
}

