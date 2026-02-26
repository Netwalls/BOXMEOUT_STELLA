// backend/src/routes/wallet.routes.ts
// Wallet routes — USDC withdrawal endpoint

import { Router, Request, Response, NextFunction } from 'express';
import { walletController } from '../controllers/wallet.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { withdrawalRateLimiter } from '../middleware/rateLimit.middleware.js';
import { AuthenticatedRequest } from '../types/auth.types.js';

const router: Router = Router();

/**
 * @swagger
 * /api/wallet/withdraw:
 *   post:
 *     summary: Withdraw USDC to connected wallet
 *     description: >
 *       Withdraws the specified amount of USDC from the user's platform balance
 *       and sends it on-chain to their connected Stellar wallet address.
 *       Rate limited to 3 withdrawals per 24 hours.
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 0.0000001
 *                 description: USDC amount to withdraw
 *                 example: 25.50
 *     responses:
 *       201:
 *         description: Withdrawal successful
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
 *                     txHash:
 *                       type: string
 *                       description: Stellar transaction hash
 *                       example: "a1b2c3d4..."
 *                     amountWithdrawn:
 *                       type: number
 *                       example: 25.50
 *                     newBalance:
 *                       type: number
 *                       description: Updated platform USDC balance
 *                       example: 74.50
 *       400:
 *         description: >
 *           Invalid amount, insufficient balance, or no wallet connected.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       enum:
 *                         - INVALID_AMOUNT
 *                         - INSUFFICIENT_BALANCE
 *                         - WALLET_NOT_CONNECTED
 *                     message:
 *                       type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         description: Withdrawal rate limit exceeded (max 3 per 24 hours)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: RATE_LIMITED
 *                     message:
 *                       type: string
 *                       example: "Withdrawal limit reached. Maximum 3 withdrawals per 24 hours."
 */
router.post(
  '/withdraw',
  requireAuth,
  withdrawalRateLimiter,
  (req: Request, res: Response, next: NextFunction) => {
    walletController.withdraw(req as AuthenticatedRequest, res).catch(next);
  }
);

export default router;
