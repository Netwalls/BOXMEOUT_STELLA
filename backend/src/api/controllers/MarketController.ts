// ============================================================
// BOXMEOUT — Market Controller
// Handles HTTP requests for market-related endpoints.
// Contributors: implement every function marked TODO.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { StrKey } from '@stellar/stellar-sdk';
import { AppError } from '../../utils/AppError';
import { validateQuery } from '../middleware/validate';
import * as MarketService from '../../services/MarketService';

/**
 * GET /api/markets
 * Query params: status, weight_class, page (default 1), limit (default 20)
 *
 * Returns paginated market list.
 * Validates query params with Zod before passing to MarketService.
 * Responds 400 on invalid params, 200 with { markets, total, page, limit }.
 */
export async function listMarkets(_req: Request, _res: Response): Promise<void> {
  // TODO: implement
}

/**
 * GET /api/markets/:market_id
 *
 * Returns full market detail including current odds.
 * Responds 404 if market_id not found, 200 with Market object.
 */
export async function getMarket(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { market_id } = req.params;
    const market = await MarketService.getMarketById(market_id);
    res.status(200).json(market);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 404) {
      return next(err);
    }
    next(err);
  }
}

const marketBetsQuerySchema = z.object({
  address: z
    .string()
    .refine((v) => StrKey.isValidEd25519PublicKey(v), {
      message: 'Invalid Stellar address format',
    })
    .optional(),
});

/**
 * GET /api/markets/:market_id/bets
 * Query params: address (optional — filter to one bettor)
 *
 * Returns all bets for a market.
 * Responds 404 if market not found, 200 with Bet[].
 */
export const getMarketBetsValidation = validateQuery(marketBetsQuerySchema);

export async function getMarketBets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { market_id } = req.params;
    const { address } = req.query;

    if (address !== undefined) {
      if (typeof address !== 'string' || !StrKey.isValidEd25519PublicKey(address)) {
        throw new AppError(400, 'Invalid Stellar address format');
      }
    }

    const bets = await MarketService.getBetsByMarket(market_id, address as string | undefined);
    res.json(bets);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/markets/:market_id/stats
 *
 * Returns aggregate market statistics.
 * Responds 404 if market not found, 200 with MarketStats.
 */
export async function getMarketStats(_req: Request, _res: Response): Promise<void> {
  // TODO: implement
}
