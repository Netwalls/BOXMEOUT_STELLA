// backend/src/routes/markets.routes.ts
// Market routes - endpoint definitions

import { Router } from 'express';
import { marketsController } from '../controllers/markets.controller.js';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware.js';
import { apiRateLimiter, tradeRateLimiter } from '../middleware/rateLimit.middleware.js';

const router = Router();

/**
 * POST /api/markets - Create new market
 * Requires authentication and wallet connection
 */
router.post('/', requireAuth, apiRateLimiter, (req, res) =>
  marketsController.createMarket(req, res)
);

/**
 * GET /api/markets - List all markets
 * Optional authentication for personalized results
 */
router.get('/', optionalAuth, apiRateLimiter, (req, res) =>
  marketsController.listMarkets(req, res)
);

/**
 * GET /api/markets/:id - Get market details
 * Optional authentication for personalized data
 */
router.get('/:id', optionalAuth, apiRateLimiter, (req, res) =>
  marketsController.getMarketDetails(req, res)
);

/**
 * POST /api/markets/:id/pool - Create AMM pool for a market
 * Requires authentication and admin/operator privileges (uses admin signer)
 */
router.post('/:id/pool', requireAuth, apiRateLimiter, (req, res) =>
  marketsController.createPool(req, res)
);

/**
 * POST /api/markets/:id/buy-shares - Buy shares in a market
 * Requires authentication, uses trade rate limiter (30/min per wallet)
 */
router.post('/:id/buy-shares', requireAuth, tradeRateLimiter, (req, res) =>
  marketsController.buyShares(req, res)
);

/**
 * POST /api/markets/:id/sell-shares - Sell shares in a market
 * Requires authentication, uses trade rate limiter (30/min per wallet)
 */
router.post('/:id/sell-shares', requireAuth, tradeRateLimiter, (req, res) =>
  marketsController.sellShares(req, res)
);

export default router;
