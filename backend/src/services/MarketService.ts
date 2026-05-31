// ============================================================
// BOXMEOUT — Market Service
// Business logic layer between controllers and the DB/chain.
// Contributors: implement every function marked TODO.
// ============================================================

import type { Market, MarketStats, PlatformStats } from '../models/Market';
import type { Bet } from '../models/Bet';
import { pool } from '../config/db';
import { cacheGet, cacheSet, cacheDelete, cacheDeletePattern } from './cache.service';
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
  fighter?: string;
  dateFrom?: Date;
  dateTo?: Date;
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

export interface OutcomeOdds {
  outcome: string;
  multiplier: number;
  implied_probability: number;
  pool: string;
  total_pool: string;
}

export interface AllOutcomeOdds {
  market_id: string;
  fighter_a: OutcomeOdds;
  fighter_b: OutcomeOdds;
  draw: OutcomeOdds;
  total_pool: string;
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

export interface BettorStats {
  total_wagered_xlm: number;
  total_winnings_xlm: number;
  total_bets: number;
  win_rate: number;
  favorite_fighter: string | null;
}

export interface ProjectedPayout {
  amount: string;
  formatted_xlm: number;
}

/**
 * Returns paginated markets from the database.
 *
 * Steps:
 *   1. Build WHERE clause from filters (status, weight_class, fighter name, date range)
 *   2. Apply pagination (LIMIT / OFFSET)
 *   3. Check Redis cache — return cached result if fresh (TTL 30s)
 *   4. Query DB if cache miss; store result in cache before returning
 *   5. Sort by scheduled_at DESC by default
 */
export async function getMarkets(
  filters?: MarketFilters,
  pagination?: Pagination,
): Promise<MarketListResult> {
  const statusKey = filters?.status ?? '';
  const weightKey = filters?.weight_class ?? '';
  const fighterKey = filters?.fighter ?? '';
  const dateFromKey = filters?.dateFrom?.toISOString() ?? '';
  const dateToKey = filters?.dateTo?.toISOString() ?? '';
  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 50;
  const cacheKey = `markets:${statusKey}:${weightKey}:${fighterKey}:${dateFromKey}:${dateToKey}:${page}:${limit}`;
  const cached = await cacheGet<MarketListResult>(cacheKey);
  if (cached) return cached;

  let result: MarketListResult;
  if (_db) {
    const markets = await db().findMarkets(filters);
    const filtered = markets.filter((market) => {
      if (filters?.status && market.status !== filters.status) return false;
      if (filters?.weight_class && market.weight_class !== filters.weight_class) return false;
      if (filters?.fighter) {
        const fighterLower = filters.fighter.toLowerCase();
        if (!market.fighter_a.toLowerCase().includes(fighterLower) && 
            !market.fighter_b.toLowerCase().includes(fighterLower)) {
          return false;
        }
      }
      if (filters?.dateFrom && new Date(market.scheduled_at) < filters.dateFrom) return false;
      if (filters?.dateTo && new Date(market.scheduled_at) > filters.dateTo) return false;
      return true;
    });

    const sorted = [...filtered].sort(
      (a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime(),
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
    if (filters?.fighter) {
      values.push(`%${filters.fighter}%`);
      whereClauses.push(`(fighter_a ILIKE $${values.length} OR fighter_b ILIKE $${values.length})`);
    }
    if (filters?.dateFrom) {
      values.push(filters.dateFrom);
      whereClauses.push(`scheduled_at >= $${values.length}`);
    }
    if (filters?.dateTo) {
      values.push(filters.dateTo);
      whereClauses.push(`scheduled_at <= $${values.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const rows = await pool.query(
      `SELECT * FROM markets ${whereSql} ORDER BY scheduled_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
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
 * Invalidates cache for a market when it's updated.
 * Clears the market cache and related pattern caches.
 */
export async function invalidateMarketCache(market_id: string): Promise<void> {
  await cacheDelete(`market:${market_id}`);
  await cacheDeletePattern(`markets:*`);
  await cacheDelete(`market:${market_id}:stats`);
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
  if (!market) throw AppError.notFound(`Market not found: ${market_id}`);

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
  if (!market) throw AppError.notFound(`Market not found: ${market_id}`);

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
 * Calculates parimutuel odds for a market.
 * 
 * Formula: odds_x = total_pool / outcome_pool
 * Returns all three odds as floats rounded to 2 decimal places.
 * Returns { fighterA: 0, fighterB: 0, draw: 0 } for empty pools.
 */
export async function calculateOdds(market_id: string): Promise<{ fighterA: number; fighterB: number; draw: number }> {
  const market = await db().findMarketById(market_id);
  if (!market) throw AppError.notFound(`Market not found: ${market_id}`);

  const total_pool = BigInt(market.total_pool);
  const pool_a = BigInt(market.pool_a);
  const pool_b = BigInt(market.pool_b);
  const pool_draw = BigInt(market.pool_draw);

  if (total_pool === 0n) {
    return { fighterA: 0, fighterB: 0, draw: 0 };
  }

  const fighterA = pool_a === 0n ? 0 : Number((total_pool * 100n) / pool_a) / 100;
  const fighterB = pool_b === 0n ? 0 : Number((total_pool * 100n) / pool_b) / 100;
  const draw = pool_draw === 0n ? 0 : Number((total_pool * 100n) / pool_draw) / 100;

  return {
    fighterA: Math.round(fighterA * 100) / 100,
    fighterB: Math.round(fighterB * 100) / 100,
    draw: Math.round(draw * 100) / 100,
  };
}

/** Shared pool loader for odds calculations. */
async function loadMarketPools(market_id: string) {
  const market = await db().findMarketById(market_id);
  if (!market) throw AppError.notFound(`Market not found: ${market_id}`);
  return {
    totalPool: BigInt(market.total_pool),
    poolA: BigInt(market.pool_a),
    poolB: BigInt(market.pool_b),
    poolDraw: BigInt(market.pool_draw),
    feeBps: BigInt(market.fee_bps),
    totalPoolStr: market.total_pool,
  };
}

/** Build an OutcomeOdds from raw pool values. */
function computeOutcomeOdds(
  pool: bigint,
  totalPool: bigint,
  feeBps: bigint,
  outcome: string,
  totalPoolStr: string,
): OutcomeOdds {
  if (totalPool === 0n || pool === 0n) {
    return { outcome, multiplier: 0, implied_probability: 0, pool: pool.toString(), total_pool: totalPoolStr };
  }
  const fee = (totalPool * feeBps) / 10000n;
  const netPool = totalPool - fee;
  const multiplier = Number((netPool * 10000n) / pool) / 10000;
  const implied_probability = Number((pool * 10000n) / totalPool) / 100;
  return {
    outcome,
    multiplier: Math.round(multiplier * 100) / 100,
    implied_probability: Math.round(implied_probability * 100) / 100,
    pool: pool.toString(),
    total_pool: totalPoolStr,
  };
}

/**
 * Calculates parimutuel odds for a single specific outcome.
 *
 * Parimutuel formula:
 *   multiplier = (total_pool - fee) / outcome_pool
 *   implied_probability = outcome_pool / total_pool
 *
 * Returns zero multiplier/probability for empty pools.
 */
export async function calculateSingleOutcomeOdds(
  market_id: string,
  outcome: 'fighter_a' | 'fighter_b' | 'draw',
): Promise<OutcomeOdds> {
  const { totalPool, poolA, poolB, poolDraw, feeBps, totalPoolStr } = await loadMarketPools(market_id);
  const pool = outcome === 'fighter_a' ? poolA : outcome === 'fighter_b' ? poolB : poolDraw;
  return computeOutcomeOdds(pool, totalPool, feeBps, outcome, totalPoolStr);
}

/**
 * Calculates parimutuel odds for all three outcomes.
 *
 * Parimutuel formula (per outcome):
 *   multiplier = (total_pool - fee) / outcome_pool
 *   implied_probability = outcome_pool / total_pool
 *
 * Returns zeros for outcomes with empty pools.
 */
export async function calculateOutcomeOdds(
  market_id: string,
): Promise<AllOutcomeOdds> {
  const { totalPool, poolA, poolB, poolDraw, feeBps, totalPoolStr } = await loadMarketPools(market_id);

  return {
    market_id,
    fighter_a: computeOutcomeOdds(poolA, totalPool, feeBps, 'fighter_a', totalPoolStr),
    fighter_b: computeOutcomeOdds(poolB, totalPool, feeBps, 'fighter_b', totalPoolStr),
    draw: computeOutcomeOdds(poolDraw, totalPool, feeBps, 'draw', totalPoolStr),
    total_pool: totalPoolStr,
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
 * Returns aggregate statistics for a bettor address.
 * Totals are computed in XLM. Returns zeroed stats when no bets exist.
 */
export async function getBettorStats(bettor_address: string): Promise<BettorStats> {
  const bets = await getBetsByAddress(bettor_address);
  const total_bets = bets.length;
  const total_wagered_xlm = bets.reduce((sum, bet) => sum + Number(bet.amount) / 10_000_000, 0);
  const total_winnings_xlm = bets
    .filter((bet) => bet.claimed && bet.payout)
    .reduce((sum, bet) => sum + Number(bet.payout ?? '0') / 10_000_000, 0);

  const outcomeCounts = bets.reduce<Record<string, number>>((counts, bet) => {
    counts[bet.side] = (counts[bet.side] ?? 0) + 1;
    return counts;
  }, {});

  const favorite_fighter = Object.entries(outcomeCounts).reduce<string | null>((best, [side, count]) => {
    if (best === null) return side;
    return count > (outcomeCounts[best] ?? 0) ? side : best;
  }, null);

  const win_rate = total_bets === 0 ? 0 : Math.round((bets.filter((bet) => bet.claimed && bet.payout).length * 10000) / total_bets) / 100;

  return {
    total_wagered_xlm,
    total_winnings_xlm,
    total_bets,
    win_rate,
    favorite_fighter,
  };
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
 * Simulates projected payout for a hypothetical bet on a market.
 *
 * Parimutuel formula:
 *   payout = (hypothetical_amount / outcome_pool) * (total_pool - fee)
 *
 * Returns zero if the outcome pool is empty or the market is cancelled.
 */
export async function simulateProjectedPayout(
  market_id: string,
  amount: string,
  outcome: 'fighter_a' | 'fighter_b' | 'draw',
): Promise<ProjectedPayout> {
  const market = await db().findMarketById(market_id);
  if (!market) throw AppError.notFound(`Market not found: ${market_id}`);

  if (market.status === 'cancelled') {
    return { amount: '0', formatted_xlm: 0 };
  }

  const betAmount = BigInt(amount);
  if (betAmount <= 0n) {
    return { amount: '0', formatted_xlm: 0 };
  }

  const total_pool = BigInt(market.total_pool);
  const fee_bps = market.fee_bps;
  const fee = (total_pool * BigInt(fee_bps)) / 10000n;
  const pool_after_fee = total_pool - fee;

  let winning_pool: bigint;
  if (outcome === 'fighter_a') {
    winning_pool = BigInt(market.pool_a);
  } else if (outcome === 'fighter_b') {
    winning_pool = BigInt(market.pool_b);
  } else {
    winning_pool = BigInt(market.pool_draw);
  }

  if (winning_pool <= 0n) {
    return { amount: '0', formatted_xlm: 0 };
  }

  const payout = (betAmount * pool_after_fee) / winning_pool;
  const formatted_xlm = Number(payout) / 10_000_000;

  return {
    amount: payout.toString(),
    formatted_xlm,
  };
}

/**
 * Returns aggregate platform statistics for the home page banner.
 * Queries: COUNT(*) WHERE status='Open', SUM(total_pool), COUNT(bets)
 * Results cached in Redis for 60 seconds.
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  const cacheKey = 'platform:stats';
  const cached = await cacheGet<PlatformStats>(cacheKey);
  if (cached) return cached;

  if (_db) {
    // If using test adapter, compute from in-memory data
    const allMarkets = await db().findMarkets();
    const openMarkets = allMarkets.filter(m => m.status === 'open');
    const allBets = await Promise.all(
      allMarkets.map(m => db().findBetsByMarket(m.market_id))
    ).then(results => results.flat());

    const totalVolume = allMarkets.reduce((sum, m) => sum + Number(m.total_pool) / 10_000_000, 0);

    const stats: PlatformStats = {
      totalMarkets: allMarkets.length,
      activeMarkets: openMarkets.length,
      totalVolume,
      totalBets: allBets.length,
    };

    await cacheSet(cacheKey, stats, 60);
    return stats;
  }

  const marketsResult = await pool.query(
    "SELECT COUNT(*) as total, SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as active, SUM(total_pool) as volume FROM markets"
  );

  const betsResult = await pool.query('SELECT COUNT(*) as total FROM bets');

  const { total: totalMarkets, active: activeMarkets, volume: totalPoolStroops } = marketsResult.rows[0];
  const { total: totalBets } = betsResult.rows[0];

  const stats: PlatformStats = {
    totalMarkets: Number(totalMarkets) || 0,
    activeMarkets: Number(activeMarkets) || 0,
    totalVolume: (Number(totalPoolStroops) || 0) / 10_000_000,
    totalBets: Number(totalBets) || 0,
  };

  await cacheSet(cacheKey, stats, 60);
  return stats;
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

export interface BulkResult {
  succeeded: string[];
  failed: { id: string; reason: string }[];
}

/**
 * Pauses (locks) up to 50 open markets in a single admin action.
 * Each market is processed independently — failures do not abort others.
 */
export async function bulkPauseMarkets(marketIds: string[]): Promise<BulkResult> {
  const result: BulkResult = { succeeded: [], failed: [] };

  for (const id of marketIds) {
    try {
      const { rows } = await pool.query(
        `UPDATE markets SET status = 'locked', updated_at = NOW()
         WHERE market_id = $1 AND status = 'open'
         RETURNING market_id`,
        [id],
      );
      if (rows.length === 0) {
        result.failed.push({ id, reason: 'Market not found or not in open status' });
      } else {
        await invalidateMarketCache(id);
        result.succeeded.push(id);
      }
    } catch (err) {
      result.failed.push({ id, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}

/**
 * Cancels up to 50 open/locked markets and enqueues notifications for all
 * position holders of each successfully cancelled market.
 * Each market is processed independently — failures do not abort others.
 */
export async function bulkCancelMarkets(
  marketIds: string[],
  reason: string,
): Promise<BulkResult> {
  const result: BulkResult = { succeeded: [], failed: [] };

  for (const id of marketIds) {
    try {
      const { rows } = await pool.query(
        `UPDATE markets SET status = 'cancelled', updated_at = NOW()
         WHERE market_id = $1 AND status IN ('open', 'locked')
         RETURNING market_id`,
        [id],
      );
      if (rows.length === 0) {
        result.failed.push({ id, reason: 'Market not found or not cancellable' });
        continue;
      }

      await invalidateMarketCache(id);

      // Enqueue notifications for all position holders
      const bettors = await pool.query(
        `SELECT DISTINCT bettor_address FROM bets WHERE market_id = $1`,
        [id],
      );
      if (bettors.rows.length > 0) {
        const values = bettors.rows
          .map((_: unknown, i: number) => `($${i * 4 + 1}, $${i * 4 + 2}, 'market_cancelled', 'pending', NOW())`)
          .join(', ');
        const params = bettors.rows.flatMap((r: { bettor_address: string }) => [r.bettor_address, id]);
        await pool.query(
          `INSERT INTO notification_jobs (bettor_address, market_id, job_type, status, created_at) VALUES ${values}`,
          params,
        );
      }

      result.succeeded.push(id);
    } catch (err) {
      result.failed.push({ id, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
