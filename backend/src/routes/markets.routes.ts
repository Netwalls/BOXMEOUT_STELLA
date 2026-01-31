// backend/src/routes/markets.routes.ts
// Market routes - endpoint definitions

import { Router } from 'express';
import { marketsController } from '../controllers/markets.controller.js';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware.js';

const router: Router = Router();

/**
 * POST /api/markets - Create new market
 * Requires authentication and wallet connection
 */
router.post('/', requireAuth, (req, res) =>
  marketsController.createMarket(req, res)
);

/**
 * GET /api/markets - List all markets
 * Optional authentication for personalized results
 */
router.get('/', optionalAuth, (req, res) =>
  marketsController.listMarkets(req, res)
);

/**
 * GET /api/markets/:id - Get market details
 * Optional authentication for personalized data
 */
router.get('/:id', optionalAuth, (req, res) =>
  marketsController.getMarketDetails(req, res)
);

/**
 * POST /api/markets/:id/pool - Create AMM pool for a market
 * Requires authentication and admin/operator privileges (uses admin signer)
 */
router.post('/:id/pool', requireAuth, (req, res) =>
  marketsController.createPool(req, res)
);

export default router;
