// backend/src/routes/submit-tx.routes.ts
// POST /api/trading/submit-tx — user-signed transaction submission
// POST /api/trading/sell      — direct sell shares (issue #16)

import { Router } from 'express';
import { submitTxController } from '../controllers/submit-tx.controller.js';
import { tradingController } from '../controllers/trading.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { tradeRateLimiter } from '../middleware/rateLimit.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { submitTxBody, sellSharesDirectBody } from '../schemas/validation.schemas.js';

const router: Router = Router();

/**
 * @swagger
 * /api/trading/submit-tx:
 *   post:
 *     summary: Submit a user-signed Stellar transaction
 *     description: >
 *       Accepts a base64-encoded signed XDR transaction, validates it is
 *       well-formed and signed by the authenticated user, then submits it
 *       to the Stellar network.
 *     tags: [Trading]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - signedXdr
 *             properties:
 *               signedXdr:
 *                 type: string
 *                 description: Base64-encoded signed Stellar transaction XDR
 *                 example: "AAAAAgAAAAA..."
 *     responses:
 *       200:
 *         description: Transaction submitted successfully
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
 *                     transactionHash:
 *                       type: string
 *                     status:
 *                       type: string
 *       400:
 *         description: Malformed XDR or invalid signature
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       502:
 *         description: Stellar network error
 */
router.post(
  '/submit-tx',
  requireAuth,
  tradeRateLimiter,
  validate({ body: submitTxBody }),
  (req, res, next) => submitTxController.submitTx(req as any, res, next)
);

/**
 * @swagger
 * /api/trading/sell:
 *   post:
 *     summary: Sell outcome shares (issue #16)
 *     description: Sell shares back to the AMM before market resolution. Validates user holds enough shares, calls Stellar sell_shares, updates trade record and share position.
 *     tags: [Trading]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - marketId
 *               - outcomeId
 *               - sharesAmount
 *             properties:
 *               marketId:
 *                 type: string
 *                 format: uuid
 *               outcomeId:
 *                 type: integer
 *                 enum: [0, 1]
 *                 description: 0 for NO, 1 for YES
 *               sharesAmount:
 *                 type: string
 *                 description: Number of shares to sell (base units, numeric string)
 *               minCollateralOut:
 *                 type: string
 *                 description: Minimum collateral to receive (slippage protection, numeric string)
 *     responses:
 *       200:
 *         description: Shares sold — returns TradeReceipt
 *       400:
 *         description: Insufficient shares or slippage exceeded
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Market not found
 */
router.post(
  '/sell',
  requireAuth,
  tradeRateLimiter,
  validate({ body: sellSharesDirectBody }),
  (req, res) => tradingController.sellSharesDirect(req, res)
);

export default router;
