// backend/src/routes/trading.ts
// Trading routes - handles both direct trading and user-signed transaction flows

import { Router } from 'express';
import { tradingController } from '../controllers/trading.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { tradeRateLimiter } from '../middleware/rateLimit.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import {
  marketIdParam,
  buySharesBody,
  sellSharesBody,
  addLiquidityBody,
  removeLiquidityBody,
} from '../schemas/validation.schemas.js';

const router: Router = Router();

/**
 * POST /trading/buy
 * Custom endpoint for buying shares with specific body format
 */
router.post('/buy', requireAuth, (req, res) =>
  tradingController.buySharesNew(req, res)
);

/**
 * GET /trading/quote
 * Preview trade results (Read-only)
 */
router.get('/quote', (req, res) => tradingController.getQuote(req, res));

/**
 * @swagger
 * /api/trading/history:
 *   get:
 *     summary: Get authenticated user's trade history
 *     description: Returns a paginated list of trades for the logged-in user
 *     tags: [Trading]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Records per page
 *       - in: query
 *         name: outcomeId
 *         schema:
 *           type: integer
 *           enum: [0, 1]
 *         description: Filter by outcome (0 for NO, 1 for YES)
 *     responses:
 *       200:
 *         description: Trade history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Trade'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/history', requireAuth, (req, res) =>
  tradingController.getHistory(req, res)
);

// ─── Direct Trading / Admin-signed Routes ────────────────────────────────────
// These are typically mounted at /api/markets

/**
 * @swagger
 * /api/markets/{marketId}/buy:
 *   post:
 *     summary: Buy outcome shares
 *     description: Purchase shares for a specific outcome using AMM pricing
 *     tags: [Trading]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/MarketId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - outcome
 *               - amount
 *             properties:
 *               outcome:
 *                 type: integer
 *                 enum: [0, 1]
 *                 description: 0 for NO, 1 for YES
 *               amount:
 *                 type: number
 *                 minimum: 1
 *                 description: USDC amount to spend
 *               minShares:
 *                 type: number
 *                 description: Minimum shares to receive (slippage protection)
 *     responses:
 *       200:
 *         description: Shares purchased successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     sharesBought:
 *                       type: number
 *                     pricePerUnit:
 *                       type: number
 *                     totalCost:
 *                       type: number
 *                     feeAmount:
 *                       type: number
 *                     txHash:
 *                       type: string
 *                     tradeId:
 *                       type: string
 *                       format: uuid
 *                     position:
 *                       type: object
 *                       properties:
 *                         totalShares:
 *                           type: number
 *                         averagePrice:
 *                           type: number
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  '/:marketId/buy',
  requireAuth,
  validate({ params: marketIdParam, body: buySharesBody }),
  (req, res) => tradingController.buyShares(req, res)
);

/**
 * @swagger
 * /api/markets/{marketId}/sell:
 *   post:
 *     summary: Sell outcome shares
 *     description: Sell shares for a specific outcome using AMM pricing
 *     tags: [Trading]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/MarketId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - outcome
 *               - shares
 *             properties:
 *               outcome:
 *                 type: integer
 *                 enum: [0, 1]
 *                 description: 0 for NO, 1 for YES
 *               shares:
 *                 type: number
 *                 minimum: 0.000001
 *                 description: Number of shares to sell
 *               minPayout:
 *                 type: number
 *                 description: Minimum payout to receive (slippage protection)
 *     responses:
 *       200:
 *         description: Shares sold successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     sharesSold:
 *                       type: number
 *                     pricePerUnit:
 *                       type: number
 *                     payout:
 *                       type: number
 *                     feeAmount:
 *                       type: number
 *                     txHash:
 *                       type: string
 *                     tradeId:
 *                       type: string
 *                       format: uuid
 *                     remainingShares:
 *                       type: number
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  '/:marketId/sell',
  requireAuth,
  validate({ params: marketIdParam, body: sellSharesBody }),
  (req, res) => tradingController.sellShares(req, res)
);

/**
 * @swagger
 * /api/markets/{marketId}/odds:
 *   get:
 *     summary: Get current market odds
 *     description: Get real-time odds and liquidity for both outcomes
 *     tags: [Trading]
 *     parameters:
 *       - $ref: '#/components/parameters/MarketId'
 *     responses:
 *       200:
 *         description: Odds retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     yes:
 *                       type: object
 *                       properties:
 *                         odds:
 *                           type: number
 *                           minimum: 0
 *                           maximum: 1
 *                           description: Probability (0.0 to 1.0)
 *                         percentage:
 *                           type: number
 *                           minimum: 0
 *                           maximum: 100
 *                           description: Percentage (0 to 100)
 *                         liquidity:
 *                           type: number
 *                           description: Available liquidity in USDC
 *                     no:
 *                       type: object
 *                       properties:
 *                         odds:
 *                           type: number
 *                           minimum: 0
 *                           maximum: 1
 *                         percentage:
 *                           type: number
 *                           minimum: 0
 *                           maximum: 100
 *                         liquidity:
 *                           type: number
 *                     totalLiquidity:
 *                       type: number
 *                       description: Total pool liquidity
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:marketId/odds', (req, res) =>
  tradingController.getOdds(req, res)
);

/**
 * @swagger
 * /api/markets/{marketId}/trades:
 *   get:
 *     summary: Get public trade history for a market
 *     description: Returns a paginated list of all confirmed trades for a specific market
 *     tags: [Trading]
 *     parameters:
 *       - $ref: '#/components/parameters/MarketId'
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: outcomeId
 *         schema:
 *           type: integer
 *           enum: [0, 1]
 *     responses:
 *       200:
 *         description: Market trades retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Trade'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:marketId/trades', (req, res) =>
  tradingController.getMarketTrades(req, res)
);

/**
 * POST /api/markets/:marketId/liquidity/add - Add USDC Liquidity to Pool
 */
router.post(
  '/:marketId/liquidity/add',
  requireAuth,
  validate({ params: marketIdParam, body: addLiquidityBody }),
  (req, res) => tradingController.addLiquidity(req, res)
);

/**
 * POST /api/markets/:marketId/liquidity/remove - Remove Liquidity from Pool
 */
router.post(
  '/:marketId/liquidity/remove',
  requireAuth,
  validate({ params: marketIdParam, body: removeLiquidityBody }),
  (req, res) => tradingController.removeLiquidity(req, res)
);

// ─── User-signed Transaction Routes ──────────────────────────────────────────
// These are typically mounted at /api

/**
 * POST /api/markets/:marketId/build-tx/buy
 * Build an unsigned transaction for buying shares
 */
router.post(
  '/markets/:marketId/build-tx/buy',
  requireAuth,
  tradeRateLimiter,
  (req, res) => tradingController.buildBuySharesTx(req, res)
);

/**
 * POST /api/markets/:marketId/build-tx/sell
 * Build an unsigned transaction for selling shares
 */
router.post(
  '/markets/:marketId/build-tx/sell',
  requireAuth,
  tradeRateLimiter,
  (req, res) => tradingController.buildSellSharesTx(req, res)
);

/**
 * POST /api/submit-signed-tx
 * Submit a pre-signed transaction
 */
router.post('/submit-signed-tx', requireAuth, tradeRateLimiter, (req, res) =>
  tradingController.submitSignedTx(req, res)
);

export default router;
