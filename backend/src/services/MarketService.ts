// ============================================================
// BOXMEOUT — Market Service
// Business logic layer between controllers and the DB/chain.
// Contributors: implement every function marked TODO.
// ============================================================

import type { Market, MarketStats } from '../models/Market';
import type { Bet } from '../models/Bet';
import { pool } from '../config/db';
import { cacheGet, cacheSet } from './cache.service';
import * as StellarService from './StellarService';
import { AppError } from '../utils/AppError';

// ---------------------------------------------------------------------------
// DB adapter — thin abstraction so tests can inject a mock
// ---------------------------------------------------------------------------
export interface DbAdapter {
  findMarkets(filters?: MarketFilters): Promise<Market[]>;
  findMarketById(market_id: string): Promise<Market | null>;
  findBetsByAddress(bettor_address: string): Promise<Bet[]>;
  findBetsByMarket(market_id: string, bettor_address?: string): Promise<Bet[]>;
  updateMarketStatus(market_id: string, status: string): Promise<void>;
}

let _db: DbAdapter | null = null;

export function setDbAdapter(adapter: DbAdapter): void {
  _db = adapter;
}

function db(): DbAdapter {
  if (!_db) throw new Error('DbAdapter not initialised');
  return _db;
}

export { db };

export interface MarketFilters {
  status?: string;
  weight_class?: string;
}

export interface Pagination {
  page: number;
  limit: number;
}

export interface MarketListResult {
  markets: Market[];
  total: number;
}

export interface MarketOdds {
  odds_a: number;   // Implied probability in basis points
  odds_b: number;
  odds_draw: number;
}

export interface MarketWithOdds extends Market {
  odds: MarketOdds;
}

export interface Portfolio {
  address: string;
  active_bets: Bet[];
  past_bets: Bet[];
  total_staked_xlm: number;
  total_won_xlm: number;
  total_lost_xlm: number;
  pending_claims: Bet[];
}

/**
 * Returns paginated markets from the database.
 *
 * Steps:
 *   1. Build WHERE clause from filters (status, weight_class)
 *   2. Apply pagination (LIMIT / OFFSET)
 *   3. Check Redis cache — return cached result if fresh (TTL 30s)
 *   4. Query DB if cache miss; store result in cache before returning
 *   5. Sort by scheduled_at ASC by default
 */
export async function getMarkets(
  filters?: MarketFilters,
  pagination?: Pagination,
): Promise<MarketListResult> {
  const statusKey = filters?.status ?? '';
  const weightKey = filters?.weight_class ?? '';
  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 50;
  const cacheKey = `markets:${statusKey}:${weightKey}:${page}:${limit}`;
  const cached = await cacheGet<MarketListResult>(cacheKey);
  if (cached) return cached;

  let result: MarketListResult;
  if (_db) {
    const markets = await db().findMarkets(filters);
    const filtered = markets.filter((market) => {
      if (filters?.status && market.status !== filters.status) return false;
      if (filters?.weight_class && market.weight_class !== filters.weight_class) return false;
      return true;
    });

    const sorted = [...filtered].sort(
      (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
    );

    const offset = (page - 1) * limit;
    const paged = sorted.slice(offset, offset + limit);
    result = { markets: paged, total: sorted.length };
  } else {
    const whereClauses: string[] = [];
    const values: unknown[] = [];

    if (filters?.status) {
      values.push(filters.status);
      whereClauses.push(`status = $${values.length}`);
    }
    if (filters?.weight_class) {
      values.push(filters.weight_class);
      whereClauses.push(`weight_class = $${values.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const rows = await pool.query(
      `SELECT * FROM markets ${whereSql} ORDER BY scheduled_at ASC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    );

    const countRows = await pool.query(
      `SELECT COUNT(*) AS total FROM markets ${whereSql}`,
      values,
    );

    result = {
      markets: rows.rows.map((row) => ({
        ...row,
        scheduled_at: new Date(row.scheduled_at),
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
        resolved_at: row.resolved_at ? new Date(row.resolved_at) : null,
      } as Market)),
      total: Number(countRows.rows[0]?.total ?? 0),
    };
  }

  await cacheSet(cacheKey, result, 30);
  return result;
}

/**
 * Returns a single market by its on-chain market_id string, enriched with
 * live odds from getMarketOdds().
 *
 * Steps:
 *   1. Check Redis cache — return cached result if fresh (TTL 10s)
 *   2. Query DB; throw AppError 404 if no row found
 *   3. Fetch live odds via getMarketOdds()
 *   4. Merge market + odds, store in cache for 10 seconds, then return
 */
export async function getMarketById(market_id: string): Promise<MarketWithOdds> {
  const cacheKey = `market:${market_id}`;
  const cached = await cacheGet<MarketWithOdds>(cacheKey);
  if (cached) return cached;

  const market = await db().findMarketById(market_id);
  if (!market) throw new AppError(404, `Market not found: ${market_id}`);

  const odds = await getMarketOdds(market_id);
  const result: MarketWithOdds = { ...market, odds };

  await cacheSet(cacheKey, result, 10);
  return result;
}

/**
 * Returns live odds for a market.
 *
 * Formula: odds_x = floor(pool_x * 10_000 / total_pool)
 * Falls back to querying the Market contract via StellarService.readContractState()
 * if DB pool sizes are stale (updated_at older than 30 seconds).
 */
export async function getMarketOdds(market_id: string): Promise<MarketOdds> {
  const market = await db().findMarketById(market_id);
  if (!market) throw new AppError(404, `Market not found: ${market_id}`);

  const now = new Date();
  const isStale = (now.getTime() - market.updated_at.getTime()) > 30_000; // 30 seconds

  let pool_a: bigint, pool_b: bigint, pool_draw: bigint, total_pool: bigint;

  if (isStale) {
    // Fallback to on-chain read
    // Assume readContractState returns { pool_a: string, pool_b: string, pool_draw: string, total_pool: string }
    const onChainData = await StellarService.readContractState(market.contract_address, 'get_pools', []) as { pool_a: string; pool_b: string; pool_draw: string; total_pool: string };
    pool_a = BigInt(onChainData.pool_a);
    pool_b = BigInt(onChainData.pool_b);
    pool_draw = BigInt(onChainData.pool_draw);
    total_pool = BigInt(onChainData.total_pool);
  } else {
    pool_a = BigInt(market.pool_a);
    pool_b = BigInt(market.pool_b);
    pool_draw = BigInt(market.pool_draw);
    total_pool = BigInt(market.total_pool);
  }

  if (total_pool === 0n) return { odds_a: 0, odds_b: 0, odds_draw: 0 };

  return {
    odds_a: Number(pool_a * 10000n / total_pool),
    odds_b: Number(pool_b * 10000n / total_pool),
    odds_draw: Number(pool_draw * 10000n / total_pool),
  };
}

/**
 * Returns all bets placed by a given Stellar address across all markets.
 * Returns an empty array (never 404) when the address has no bets.
 */
export async function getBetsByAddress(bettor_address: string): Promise<Bet[]> {
  if (_db) {
    return db().findBetsByAddress(bettor_address);
  }

  const { rows } = await pool.query(
    'SELECT * FROM bets WHERE bettor_address = $1 ORDER BY placed_at DESC',
    [bettor_address],
  );

  return rows.map((row) => ({
    ...row,
    placed_at: new Date(row.placed_at),
    claimed_at: row.claimed_at ? new Date(row.claimed_at) : null,
  } as Bet));
}

/**
 * Returns all bets for a given market.
 * If bettor_address is provided, filters to only that bettor's bets.
 */
export async function getBetsByMarket(
  market_id: string,
  bettor_address?: string,
): Promise<Bet[]> {
  if (_db) {
    return db().findBetsByMarket(market_id, bettor_address);
  }

  const values: unknown[] = [market_id];
  let sql = 'SELECT * FROM bets WHERE market_id = $1';

  if (bettor_address) {
    values.push(bettor_address);
    sql += ` AND bettor_address = $${values.length}`;
  }

  sql += ' ORDER BY placed_at DESC';

  const { rows } = await pool.query(sql, values);
  return rows.map((row) => ({
    ...row,
    placed_at: new Date(row.placed_at),
    claimed_at: row.claimed_at ? new Date(row.claimed_at) : null,
  } as Bet));
}

/**
 * Returns aggregate statistics for a market.
 * Values are computed from the bets table, not from on-chain.
 * Results cached in Redis for 60 seconds.
 */
export async function getMarketStats(market_id: string): Promise<MarketStats> {
  const cacheKey = `market:${market_id}:stats`;
  const cached = await cacheGet<MarketStats>(cacheKey);
  if (cached) return cached;

  const bets = await db().findBetsByMarket(market_id);

  const total_bets = bets.length;
  const unique_bettors = new Set(bets.map(b => b.bettor_address)).size;
  const amounts_xlm = bets.map(b => Number(b.amount) / 10_000_000);
  const largest_bet_xlm = amounts_xlm.length > 0 ? Math.max(...amounts_xlm) : 0;
  const average_bet_xlm = amounts_xlm.length > 0 ? amounts_xlm.reduce((s, a) => s + a, 0) / amounts_xlm.length : 0;
  const total_pooled_xlm = amounts_xlm.reduce((s, a) => s + a, 0);

  const stats: MarketStats = {
    market_id,
    total_bets,
    unique_bettors,
    largest_bet_xlm,
    average_bet_xlm,
    total_pooled_xlm,
  };

  await cacheSet(cacheKey, stats, 60);
  return stats;
}

/**
 * Returns a portfolio summary for a Stellar address.
 *
 * active_bets:    bets in Open/Locked markets
 * past_bets:      bets in Resolved/Cancelled markets
 * pending_claims: unclaimed winning bets in Resolved markets
 * Totals are computed in XLM (divide stroops by 10_000_000).
 */
export async function getPortfolioByAddress(
  bettor_address: string,
): Promise<Portfolio> {
  const bets = await db().findBetsByAddress(bettor_address);
  const marketIds = [...new Set(bets.map(b => b.market_id))];
  const markets = await Promise.all(marketIds.map(id => db().findMarketById(id)));
  const marketMap = new Map(markets.filter(Boolean).map(m => [m!.market_id, m!]));

  const active_bets: Bet[] = [];
  const past_bets: Bet[] = [];
  const pending_claims: Bet[] = [];

  for (const bet of bets) {
    const market = marketMap.get(bet.market_id);
    const status = market?.status;
    if (status === 'open' || status === 'locked') {
      active_bets.push(bet);
    } else {
      past_bets.push(bet);
      if (status === 'resolved' && !bet.claimed && market?.outcome === bet.side) {
        pending_claims.push(bet);
      }
    }
  }

  const total_staked_xlm = bets.reduce((s, b) => s + Number(b.amount) / 10_000_000, 0);
  const total_won_xlm = bets
    .filter(b => b.claimed && b.payout)
    .reduce((s, b) => s + Number(b.payout) / 10_000_000, 0);
  const total_lost_xlm = past_bets
    .filter(b => !b.claimed && !pending_claims.includes(b))
    .reduce((s, b) => s + Number(b.amount) / 10_000_000, 0);

  return {
    address: bettor_address,
    active_bets,
    past_bets,
    total_staked_xlm,
    total_won_xlm,
    total_lost_xlm,
    pending_claims,
  };
}

/**
 * Returns all bets placed by a given Stellar address across all markets.
 * Returns an empty array (never 404) when the address has no bets.
 */
export async function getBetsByAddress(bettor_address: string): Promise<Bet[]> {
  if (_db) {
    return db().findBetsByAddress(bettor_address);
  }

  const { rows } = await pool.query(
    'SELECT * FROM bets WHERE bettor_address = $1 ORDER BY placed_at DESC',
    [bettor_address],
  );
  return rows.map((row) => ({
    ...row,
    placed_at: new Date(row.placed_at),
    claimed_at: row.claimed_at ? new Date(row.claimed_at) : null,
  } as Bet));
}

/**
 * Returns all markets in which a given address has at least one bet.
 * Used as a helper by getPortfolioByAddress.
 */
export async function getMarketsByBettor(
  _bettor_address: string,
): Promise<Market[]> {
  // TODO: implement
  throw new Error('Not implemented');
}
