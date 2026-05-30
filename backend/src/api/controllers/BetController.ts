// ============================================================
// BOXMEOUT — Bet Controller
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { StrKey } from '@stellar/stellar-sdk';
import { AppError } from '../../utils/AppError';
import * as MarketService from '../../services/MarketService';

/**
 * GET /api/bets/:bettor_address
 *
 * Returns all bets placed by a Stellar G... address across all markets.
 * Validates that bettor_address is a valid Stellar public key (G..., 56 chars).
 * Responds 400 on invalid address format, 200 with Bet[] (empty array if no bets).
 */
export async function getBetsByAddress(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { bettor_address } = req.params;

    if (!StrKey.isValidEd25519PublicKey(bettor_address)) {
      throw new AppError(400, 'Invalid Stellar address format');
    }

    const bets = await MarketService.getBetsByAddress(bettor_address);
    res.status(200).json(bets);
  } catch (err) {
    next(err);
  }
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
