// backend/src/routes/portfolio.routes.ts
// Portfolio routes - manage user share positions

import { Router, Request, Response } from 'express';
import { sharesController } from '../controllers/shares.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router: Router = Router();

/**
 * GET /api/portfolio - Get Portfolio Summary
 * Requires authentication
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     totalPositions: number,
 *     totalCostBasis: number,
 *     totalCurrentValue: number,
 *     totalUnrealizedPnl: number,
 *     totalUnrealizedPnlPercentage: number,
 *     positions: Array<{
 *       id: string,
 *       marketId: string,
 *       marketTitle: string,
 *       marketStatus: string,
 *       outcome: number,
 *       outcomeName: string,
 *       quantity: number,
 *       costBasis: number,
 *       entryPrice: number,
 *       currentPrice: number,
 *       currentValue: number,
 *       unrealizedPnl: number,
 *       unrealizedPnlPercentage: number,
 *       acquiredAt: string
 *     }>
 *   }
 * }
 */
router.get('/', requireAuth, (req: Request, res: Response) =>
  sharesController.getPortfolioSummary(req, res)
);

/**
 * GET /api/portfolio/positions - Get All User Positions
 * Requires authentication
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     positions: Array<Position>,
 *     count: number
 *   }
 * }
 */
router.get('/positions', requireAuth, (req: Request, res: Response) =>
  sharesController.getUserPositions(req, res)
);

/**
 * GET /api/portfolio/markets/:marketId - Get Positions for Specific Market
 * Requires authentication
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     marketId: string,
 *     positions: Array<Position>,
 *     count: number
 *   }
 * }
 */
router.get('/markets/:marketId', requireAuth, (req: Request, res: Response) =>
  sharesController.getMarketPositions(req, res)
);

/**
 * POST /api/portfolio/refresh - Refresh All Position Values
 * Requires authentication
 * Updates current_value and unrealized_pnl based on latest AMM prices
 *
 * Response:
 * {
 *   success: true,
 *   message: "Portfolio positions refreshed successfully"
 * }
 */
router.post('/refresh', requireAuth, (req: Request, res: Response) =>
  sharesController.refreshPositions(req, res)
);

export default router;
