// backend/src/routes/trading.ts
// Trading routes - buy/sell shares and get odds

import { Router } from 'express';
import { tradingController } from '../controllers/trading.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

/**
 * POST /api/markets/:marketId/buy - Buy Outcome Shares
 * Requires authentication
 * 
 * Request Body:
 * {
 *   outcome: 0 | 1,  // 0 for NO, 1 for YES
 *   amount: number,   // USDC amount to spend
 *   minShares?: number  // Minimum shares to receive (slippage protection)
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     sharesBought: number,
 *     pricePerUnit: number,
 *     totalCost: number,
 *     feeAmount: number,
 *     txHash: string,
 *     tradeId: string,
 *     position: {
 *       totalShares: number,
 *       averagePrice: number
 *     }
 *   }
 * }
 */
router.post(
  '/:marketId/buy',
  requireAuth,
  (req, res) => tradingController.buyShares(req, res)
);

/**
 * POST /api/markets/:marketId/sell - Sell Outcome Shares
 * Requires authentication
 * 
 * Request Body:
 * {
 *   outcome: 0 | 1,    // 0 for NO, 1 for YES
 *   shares: number,     // Number of shares to sell
 *   minPayout?: number  // Minimum payout to receive (slippage protection)
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     sharesSold: number,
 *     pricePerUnit: number,
 *     payout: number,
 *     feeAmount: number,
 *     txHash: string,
 *     tradeId: string,
 *     remainingShares: number
 *   }
 * }
 */
router.post(
  '/:marketId/sell',
  requireAuth,
  (req, res) => tradingController.sellShares(req, res)
);

/**
 * GET /api/markets/:marketId/odds - Get Current Market Odds
 * No authentication required
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     yes: {
 *       odds: number,        // 0.0 to 1.0
 *       percentage: number,  // 0 to 100
 *       liquidity: number
 *     },
 *     no: {
 *       odds: number,
 *       percentage: number,
 *       liquidity: number
 *     },
 *     totalLiquidity: number
 *   }
 * }
 */
router.get(
  '/:marketId/odds',
  (req, res) => tradingController.getOdds(req, res)
);

export default router;
