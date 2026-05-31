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
import * as OracleService from '../../oracle/OracleService';

// ---------------------------------------------------------------------------
// Issue #18 — listMarkets
// ---------------------------------------------------------------------------

const VALID_STATUSES = ['open', 'locked', 'resolved', 'cancelled', 'disputed'] as const;

const listMarketsQuerySchema = z.object({
  status: z
    .enum(VALID_STATUSES)
    .optional(),
  weight_class: z.string().min(1).optional(),
  fighter: z.string().min(1).optional(),
  dateFrom: z.string().datetime().optional().transform(v => v ? new Date(v) : undefined),
  dateTo: z.string().datetime().optional().transform(v => v ? new Date(v) : undefined),
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
    const query = req.query as unknown as z.infer<typeof listMarketsQuerySchema>;
    const { status, weight_class, fighter, dateFrom, dateTo, page, limit } = query;
    const { markets, total } = await MarketService.getMarkets(
      { status, weight_class, fighter, dateFrom, dateTo },
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
    if (!/^\d+$/.test(market_id)) {
      throw AppError.badRequest('marketId must be a valid numeric string');
    }
    const market = await MarketService.getMarketById(market_id);
    res.status(200).json(market);
  } catch (err) {
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
        throw AppError.badRequest('Invalid Stellar address format');
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

/**
 * GET /api/markets/:market_id/odds
 *
 * Returns parimutuel odds for all three outcomes (fighter_a, fighter_b, draw).
 * Each outcome includes the multiplier (net payout per unit staked) and
 * implied probability (as a percentage).
 * Responds 404 if market not found, 200 with AllOutcomeOdds.
 */
const VALID_OUTCOMES = ['fighter_a', 'fighter_b', 'draw'] as const;

export async function getMarketOdds(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { market_id } = req.params;
    const outcome = req.query.outcome as string | undefined;

    if (outcome && !VALID_OUTCOMES.includes(outcome as typeof VALID_OUTCOMES[number])) {
      res.status(400).json({ error: `Invalid outcome. Must be one of: ${VALID_OUTCOMES.join(', ')}` });
      return;
    }

    if (outcome) {
      const odds = await MarketService.calculateSingleOutcomeOdds(market_id, outcome as 'fighter_a' | 'fighter_b' | 'draw');
      res.status(200).json(odds);
    } else {
      const odds = await MarketService.calculateOutcomeOdds(market_id);
      res.status(200).json(odds);
    }
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 404) {
      return next(err);
    }
    next(err);
  }
}

const simulateQuerySchema = z.object({
  amount: z.coerce.number().positive({ message: 'amount must be a positive number' }),
  outcome: z.enum(VALID_OUTCOMES),
});

/**
 * GET /api/markets/:market_id/simulate
 * Query params: amount (stroops, positive number), outcome (fighter_a | fighter_b | draw)
 *
 * Returns the projected payout for a hypothetical bet using parimutuel formula.
 * Responds 200 with { amount, formatted_xlm }.
 */
export const simulatePayoutValidation = validateQuery(simulateQuerySchema);

export async function simulatePayout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { market_id } = req.params;
    const { amount, outcome } = req.query as unknown as { amount: number; outcome: 'fighter_a' | 'fighter_b' | 'draw' };

    const payout = await MarketService.simulateProjectedPayout(
      market_id,
      String(amount),
      outcome,
    );
    res.status(200).json(payout);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 404) {
      return next(err);
    }
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
      throw AppError.badRequest('Invalid Stellar address format — must be a valid G... public key');
    }

    const bets = await MarketService.getBetsByAddress(bettor_address);
    res.status(200).json(bets);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/stats
 *
 * Returns aggregate platform statistics for the home page banner.
 * Cached for 60 seconds.
 * Responds 200 with { totalMarkets, activeMarkets, totalVolume, totalBets }.
 */
export async function getPlatformStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stats = await MarketService.getPlatformStats();
    res.status(200).json(stats);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Issue #745 — resolveMarket (admin)
// ---------------------------------------------------------------------------

const VALID_RESOLVE_OUTCOMES = ['fighter_a', 'fighter_b', 'draw', 'no_contest'] as const;

const resolveMarketBodySchema = z.object({
  winning_outcome: z.enum(VALID_RESOLVE_OUTCOMES),
});

/**
 * POST /api/markets/:market_id/resolve
 * Protected by requireAdminJwt middleware.
 *
 * Resolves a market with the given winning_outcome.
 * Returns 409 if market is already resolved.
 * Returns 200 with updated market on success.
 */
export async function resolveMarket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { market_id } = req.params;

    const parsed = resolveMarketBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message }));
      res.status(400).json({ errors });
      return;
    }

    const { winning_outcome } = parsed.data;

    const market = await MarketService.db().findMarketById(market_id);
    if (!market) throw AppError.notFound(`Market not found: ${market_id}`);

    if (market.status === 'resolved') {
      res.status(409).json({ error: 'Market is already resolved' });
      return;
    }

    await OracleService.submitFightResult(market.match_id, winning_outcome);

    const updated = await MarketService.db().findMarketById(market_id);
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}
