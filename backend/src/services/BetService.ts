// ============================================================
// BOXMEOUT — Bet Service
// Business logic for bet operations: recording, fetching, payouts
// ============================================================

import type { Bet } from '../models/Bet';
import { pool } from '../config/db';
import { cacheDelete, cacheDeletePattern } from './cache.service';
import { AppError } from '../utils/AppError';

export interface BetWithMarket extends Bet {
  market_id: string;
  fighter_a: string;
  fighter_b: string;
  status: string;
}

export interface FetchBetsResult {
  bets: BetWithMarket[];
  total: number;
}

export interface ProjectedPayout {
  amount: string;
  formatted_xlm: number;
}

/**
 * Records a bet triggered by a BetPlaced blockchain event.
 * 
 * Steps:
 *   1. Validate inputs
 *   2. Insert Bet record with tx_hash as unique key (idempotent)
 *   3. Update User.total_wagered and User.total_bets
 *   4. Invalidate Redis cache for the market
 */
export async function recordBet(
  market_id: string,
  bettor_address: string,
  side: 'fighter_a' | 'fighter_b' | 'draw',
  amount: string,
  tx_hash: string,
  ledger_sequence: number,
): Promise<Bet> {
  if (!market_id || !bettor_address || !side || !amount || !tx_hash) {
    throw AppError.badRequest('Missing required bet fields');
  }

  // Validate Stellar address format (G followed by 55 alphanumeric chars)
  if (!/^G[A-Z2-7]{55}$/.test(bettor_address)) {
    throw AppError.badRequest('Invalid Stellar address format');
  }

  const amount_xlm = Number(amount) / 10_000_000;

  try {
    const result = await pool.query(
      `INSERT INTO bets (market_id, bettor_address, side, amount, amount_xlm, tx_hash, ledger_sequence)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tx_hash) DO UPDATE SET tx_hash = EXCLUDED.tx_hash
       RETURNING *`,
      [market_id, bettor_address, side, amount, amount_xlm, tx_hash, ledger_sequence],
    );

    const bet = result.rows[0];

    // Invalidate market cache
    await cacheDeletePattern(`market:${market_id}*`);
    await cacheDeletePattern('platform:stats');

    return {
      ...bet,
      placed_at: new Date(bet.placed_at),
      claimed_at: bet.claimed_at ? new Date(bet.claimed_at) : null,
    } as Bet;
  } catch (error) {
    if ((error as any).code === '23505') {
      // Unique constraint violation on tx_hash — idempotent, return existing bet
      const existing = await pool.query(
        'SELECT * FROM bets WHERE tx_hash = $1',
        [tx_hash],
      );
      if (existing.rows.length > 0) {
        const bet = existing.rows[0];
        return {
          ...bet,
          placed_at: new Date(bet.placed_at),
          claimed_at: bet.claimed_at ? new Date(bet.claimed_at) : null,
        } as Bet;
      }
    }
    throw error;
  }
}

/**
 * Fetches paginated bets for a Stellar address.
 * 
 * Steps:
 *   1. Validate Stellar address format
 *   2. JOIN with markets table to include market info
 *   3. Sort by placed_at DESC
 *   4. Apply pagination (LIMIT / OFFSET)
 *   5. Return { bets: BetWithMarket[], total: number }
 */
export async function fetchBetsByAddress(
  bettor_address: string,
  page: number = 1,
  limit: number = 50,
): Promise<FetchBetsResult> {
  // Validate Stellar address format
  if (!/^G[A-Z2-7]{55}$/.test(bettor_address)) {
    throw AppError.badRequest('Invalid Stellar address format');
  }

  const offset = (page - 1) * limit;

  // Get total count
  const countResult = await pool.query(
    'SELECT COUNT(*) as total FROM bets WHERE bettor_address = $1',
    [bettor_address],
  );
  const total = Number(countResult.rows[0]?.total ?? 0);

  // Get paginated bets with market info
  const result = await pool.query(
    `SELECT 
       b.id, b.market_id, b.bettor_address, b.side, b.amount, b.amount_xlm,
       b.placed_at, b.claimed, b.claimed_at, b.payout, b.tx_hash, b.ledger_sequence,
       m.fighter_a, m.fighter_b, m.status
     FROM bets b
     JOIN markets m ON b.market_id = m.market_id
     WHERE b.bettor_address = $1
     ORDER BY b.placed_at DESC
     LIMIT $2 OFFSET $3`,
    [bettor_address, limit, offset],
  );

  const bets = result.rows.map((row) => ({
    ...row,
    placed_at: new Date(row.placed_at),
    claimed_at: row.claimed_at ? new Date(row.claimed_at) : null,
  } as BetWithMarket));

  return { bets, total };
}

/**
 * Calculates the projected payout for a specific bettor on a specific market.
 * 
 * Steps:
 *   1. Fetch bettor's BetPosition and market's pool sizes from DB
 *   2. Formula: (amount / winning_pool) * (total_pool - fee)
 *   3. Return "0" if bettor bet on a different outcome
 *   4. Return "0" if market is Cancelled
 */
export async function calculateProjectedPayout(
  market_id: string,
  bettor_address: string,
  outcome: 'fighter_a' | 'fighter_b' | 'draw' | null,
): Promise<ProjectedPayout> {
  // Validate Stellar address format
  if (!/^G[A-Z2-7]{55}$/.test(bettor_address)) {
    throw AppError.badRequest('Invalid Stellar address format');
  }

  // Fetch market
  const marketResult = await pool.query(
    'SELECT * FROM markets WHERE market_id = $1',
    [market_id],
  );

  if (marketResult.rows.length === 0) {
    throw AppError.notFound(`Market not found: ${market_id}`);
  }

  const market = marketResult.rows[0];

  // Return 0 if market is cancelled
  if (market.status === 'cancelled') {
    return { amount: '0', formatted_xlm: 0 };
  }

  // Fetch bettor's bet
  const betResult = await pool.query(
    'SELECT * FROM bets WHERE market_id = $1 AND bettor_address = $2',
    [market_id, bettor_address],
  );

  if (betResult.rows.length === 0) {
    return { amount: '0', formatted_xlm: 0 };
  }

  const bet = betResult.rows[0];

  // Return 0 if bettor bet on a different outcome
  if (!outcome || bet.side !== outcome) {
    return { amount: '0', formatted_xlm: 0 };
  }

  // Calculate payout: (amount / winning_pool) * (total_pool - fee)
  const amount = BigInt(bet.amount);
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

  if (winning_pool === 0n) {
    return { amount: '0', formatted_xlm: 0 };
  }

  const payout = (amount * pool_after_fee) / winning_pool;
  const formatted_xlm = Number(payout) / 10_000_000;

  return {
    amount: payout.toString(),
    formatted_xlm,
  };
}
