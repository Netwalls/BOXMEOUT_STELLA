// ============================================================
// BOXMEOUT — useProjectedPayout Hook
// Pure client-side parimutuel payout preview.
// No API call — recalculates on market, outcome, or amount change.
// ============================================================

import { useMemo } from 'react';
import type { BetSide, Market } from '../types';

/**
 * Calculates the projected payout for a bet using the parimutuel formula:
 *
 *   payout = (amount / side_pool_after) * total_pool_after * (1 - fee_bps / 10_000)
 *
 * where side_pool_after and total_pool_after include the user's bet amount.
 *
 * @param market  - The market to bet on (provides pool sizes and fee)
 * @param side    - Which outcome the user is betting on
 * @param amount  - Bet amount in XLM (as a number)
 * @returns Projected payout in XLM, or null if any input is missing/invalid
 */
export function useProjectedPayout(
  market: Market | null | undefined,
  side: BetSide | null | undefined,
  amount: number | null | undefined,
): number | null {
  return useMemo(() => {
    if (!market || !side || amount == null || amount <= 0) return null;

    // Convert XLM to stroops for integer arithmetic
    const STROOPS = 10_000_000n;
    const amountStroops = BigInt(Math.round(amount * 10_000_000));

    const poolA = BigInt(market.pool_a);
    const poolB = BigInt(market.pool_b);
    const poolDraw = BigInt(market.pool_draw);

    // Side pool before this bet
    const sidePoolBefore =
      side === 'fighter_a' ? poolA : side === 'fighter_b' ? poolB : poolDraw;

    // Pools after including this bet
    const sidePoolAfter = sidePoolBefore + amountStroops;
    const totalPoolAfter = poolA + poolB + poolDraw + amountStroops;

    // Zero-pool edge case: if side pool after is 0 (shouldn't happen since we add amount)
    if (sidePoolAfter === 0n) return null;

    // fee_bps is in basis points (0–10000); scale factor = 10000 - fee_bps
    const feeFactor = BigInt(10_000 - market.fee_bps);

    // payout_stroops = (amountStroops * totalPoolAfter * feeFactor) / (sidePoolAfter * 10_000)
    const payoutStroops =
      (amountStroops * totalPoolAfter * feeFactor) / (sidePoolAfter * 10_000n);

    // Convert back to XLM
    return Number(payoutStroops) / Number(STROOPS);
  }, [market, side, amount]);
}
