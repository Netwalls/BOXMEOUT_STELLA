// ============================================================
// BOXMEOUT — Bet Controller
// ============================================================

import type { Request, Response } from 'express';

/**
 * GET /api/bets/:bettor_address
 *
 * Returns all bets placed by a Stellar G... address across all markets.
 * Validates that bettor_address is a valid Stellar public key (G...).
 * Responds 400 on invalid address, 200 with Bet[].
 */
export async function getBetsByAddress(
  _req: Request,
  _res: Response,
): Promise<void> {
  // TODO: implement
}

/**
 * GET /api/portfolio/:address
 *
 * Returns a full portfolio summary for a Stellar address:
 *   - active_bets, past_bets, pending_claims
 *   - total_staked_xlm, total_won_xlm, total_lost_xlm
 *
 * Responds 400 on invalid address, 200 with Portfolio object.
 * Returns empty portfolio (all zeros, empty arrays) if address has no bets.
 */
export async function getPortfolio(
  _req: Request,
  _res: Response,
): Promise<void> {
  // TODO: implement
}
