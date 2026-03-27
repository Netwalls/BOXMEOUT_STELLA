// backend/src/routes/wallet.routes.ts
// Wallet routes — USDC deposit + withdrawal endpoints

import { Router, Request, Response, NextFunction } from 'express';
import { walletController } from '../controllers/wallet.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  withdrawalRateLimiter,
  createRateLimiter,
} from '../middleware/rateLimit.middleware.js';
import { AuthenticatedRequest } from '../types/auth.types.js';

const router: Router = Router();

/** Deposit: 5 initiation requests per 10 minutes per wallet */
const depositInitiateRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
  prefix: 'deposit-initiate',
  message: 'Too many deposit initiation requests. Please wait a moment.',
});

/** Deposit confirm: 10 attempts per 10 minutes per wallet */
const depositConfirmRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  prefix: 'deposit-confirm',
  message: 'Too many deposit confirmation attempts.',
});

/**
 * @swagger
 * /api/wallet/deposit/initiate:
 *   post:
 *     summary: Initiate a USDC deposit
 *     description: >
 *       Returns the platform's Stellar deposit address and a user-specific memo.
 *       The user must send USDC to that address with the memo, then call
 *       /api/wallet/deposit/confirm with the resulting transaction hash.
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Deposit instructions returned
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
 *                     depositAddress:
 *                       type: string
 *                       description: Platform Stellar address to send USDC to
 *                     memo:
 *                       type: string
 *                       description: Memo to include on the Stellar transaction
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/deposit/initiate',
  requireAuth,
  depositInitiateRateLimiter,
  (req: Request, res: Response, next: NextFunction) => {
    walletController
      .initiateDeposit(req as AuthenticatedRequest, res)
      .catch(next);
  }
);

/**
 * @swagger
 * /api/wallet/deposit/confirm:
 *   post:
 *     summary: Confirm an on-chain USDC deposit
 *     description: >
 *       Verifies the Stellar transaction hash, credits the user's platform
 *       balance, and records the deposit. Idempotent — duplicate calls for
 *       the same txHash return a 409.
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
 *               - txHash
 *             properties:
 *               txHash:
 *                 type: string
 *                 description: Stellar transaction hash for the USDC payment
 *                 example: "abc123..."
 *     responses:
 *       200:
 *         description: Deposit confirmed and balance credited
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     txHash:
 *                       type: string
 *                     amountDeposited:
 *                       type: number
 *                     newBalance:
 *                       type: number
 *       400:
 *         description: Invalid txHash or verification failed
 *       409:
 *         description: Transaction already processed
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/deposit/confirm',
  requireAuth,
  depositConfirmRateLimiter,
  (req: Request, res: Response, next: NextFunction) => {
    walletController
      .confirmDeposit(req as AuthenticatedRequest, res)
      .catch(next);
  }
);

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
 *       400:
 *         description: Invalid amount, insufficient balance, or no wallet connected.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         description: Withdrawal rate limit exceeded (max 3 per 24 hours)
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
