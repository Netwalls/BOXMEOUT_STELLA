// ============================================================
// BOXMEOUT — Market Controller
// Handles HTTP requests for market-related endpoints.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { StrKey } from '@stellar/stellar-sdk';
import { AppError } from '../../utils/AppError';
import { validateQuery } from '../middleware/validate';
import * as MarketService from '../../services/MarketService';

// ---------------------------------------------------------------------------
// Issue #18 — listMarkets
// ---------------------------------------------------------------------------

const VALID_STATUSES = ['open', 'locked', 'resolved', 'cancelled', 'disputed'] as const;

const listMarketsQuerySchema = z.object({
  status: z
    .enum(VALID_STATUSES, {
      errorMap: () => ({ message: `status must be one of: ${VALID_STATUSES.join(', ')}` }),
    })
    .optional(),
  weight_class: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1, { message: 'page must be an integer ≥ 1' }).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, { message: 'limit must be between 1 and 100' })
    .max(100, { message: 'limit must be between 1 and 100' })
    .default(20),
});

export const listMarketsValidation = validateQuery(listMarketsQuerySchema);

/**
 * GET /api/markets
 * Query params: status, weight_class, page (default 1), limit (default 20)
 *
 * Returns paginated market list.
 * Validates query params with Zod before passing to MarketService.
 * Responds 400 on invalid params, 200 with { markets, total, page, limit }.
 */
export async function listMarkets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status, weight_class, page, limit } = req.query as z.infer<typeof listMarketsQuerySchema>;
    const { markets, total } = await MarketService.getMarkets(
      { status, weight_class },
      { page, limit },
    );
    res.status(200).json({ markets, total, page, limit });
  } catch (err) {
    next(err);
  }
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
export async function getMarketStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { market_id } = req.params;
    const stats = await MarketService.getMarketStats(market_id);
    res.status(200).json(stats);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Issue #22 — getPortfolio
// ---------------------------------------------------------------------------

const portfolioAddressSchema = z.object({
  address: z
    .string()
    .refine((v) => StrKey.isValidEd25519PublicKey(v), {
      message: 'Invalid Stellar address format — must be a valid G... public key',
    }),
});

/**
 * GET /api/portfolio/:address
 *
 * Returns a Portfolio summary for the given Stellar address.
 * - Responds 200 with Portfolio object (zeros for unknown addresses, never 404)
 * - Responds 400 if address format is invalid
 */
export async function getPortfolio(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parseResult = portfolioAddressSchema.safeParse({ address: req.params.address });
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({ errors });
      return;
    }

    const { address } = parseResult.data;

    const portfolio = await MarketService.getPortfolioByAddress(address);
    res.status(200).json(portfolio);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/bets/:bettor_address
 *
 * Returns all bets placed by a given Stellar address across all markets.
 * Returns an empty array (never 404) when the address has no bets.
 * Responds 400 on invalid address format.
 */
export async function getBetsByAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { bettor_address } = req.params;

    if (!StrKey.isValidEd25519PublicKey(bettor_address)) {
      throw new AppError(400, 'Invalid Stellar address format — must be a valid G... public key');
    }

    const bets = await MarketService.getBetsByAddress(bettor_address);
    res.status(200).json(bets);
  } catch (err) {
    next(err);
  }
}
