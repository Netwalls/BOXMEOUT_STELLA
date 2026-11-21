/**
 * Settlement payout arithmetic (#1584).
 *
 * This mirrors `contracts/shared/src/payout.rs`. Both are checked against
 * `contracts/shared/test_vectors/payout.json`, so a change on either side
 * without updating the vectors fails CI.
 *
 * All values are integer stroops. Division truncates toward zero, which is
 * floor for the non-negative values used here.
 */

export interface PayoutInput {
  /** The bettor's stake on the winning side, in stroops. */
  stake: bigint;
  /** Settlement-time total pool, including the stake. */
  totalPool: bigint;
  /** Settlement-time winning-side pool, including the stake. 0 means no winners. */
  winningPool: bigint;
  /** Protocol fee in basis points (200 = 2%). */
  feeBp: bigint;
}

export interface PayoutBreakdown {
  payout: bigint;
  fee: bigint;
}

/** `floor(total * feeBp / 10000)`. */
export function feeOf(totalPool: bigint, feeBp: bigint): bigint {
  return (totalPool * feeBp) / 10000n;
}

/**
 * `payout = floor(stake * (total - fee) / winningPool)`, or 0 when the winning
 * pool is empty. The fee is taken from the total pool either way.
 */
export function computePayout({ stake, totalPool, winningPool, feeBp }: PayoutInput): PayoutBreakdown {
  const fee = feeOf(totalPool, feeBp);
  const net = totalPool - fee;
  if (winningPool <= 0n) return { payout: 0n, fee };
  return { payout: (stake * net) / winningPool, fee };
}
