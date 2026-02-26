// backend/src/services/wallet.service.ts
// Wallet service — handles USDC withdrawal flow

import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../database/prisma.js';
import { stellarService } from './stellar.service.js';
import { ApiError } from '../middleware/error.middleware.js';
import { logger } from '../utils/logger.js';

export interface WithdrawParams {
  userId: string;
  amount: number; // USDC amount to withdraw
}

export interface WithdrawResult {
  txHash: string;
  amountWithdrawn: number;
  newBalance: number;
}

export class WalletService {
  /**
   * Withdraw USDC from user's platform balance to their connected wallet.
   *
   * Flow:
   * 1. Fetch user + validate wallet connected
   * 2. Validate amount > 0 and <= usdcBalance
   * 3. Initiate on-chain USDC transfer via stellarService
   * 4. Debit DB balance inside a transaction after blockchain confirmation
   * 5. Return txHash + new balance
   */
  async withdraw(params: WithdrawParams): Promise<WithdrawResult> {
    const { userId, amount } = params;

    // ── Validation ─────────────────────────────────────────────────────────────
    if (!amount || amount <= 0) {
      throw new ApiError(
        400,
        'INVALID_AMOUNT',
        'Amount must be greater than 0'
      );
    }

    // ── Load user ──────────────────────────────────────────────────────────────
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
    }

    if (!user.walletAddress) {
      throw new ApiError(
        400,
        'WALLET_NOT_CONNECTED',
        'No wallet connected to this account. Please connect a Stellar wallet first.'
      );
    }

    // ── Balance check ──────────────────────────────────────────────────────────
    const currentBalance = new Decimal(user.usdcBalance.toString());
    const withdrawAmount = new Decimal(amount);

    if (withdrawAmount.greaterThan(currentBalance)) {
      throw new ApiError(
        400,
        'INSUFFICIENT_BALANCE',
        `Insufficient USDC balance. Available: ${currentBalance.toFixed(2)}, Requested: ${withdrawAmount.toFixed(2)}`
      );
    }

    logger.info('Processing USDC withdrawal', {
      userId,
      walletAddress: user.walletAddress,
      amount,
    });

    // ── On-chain transfer ──────────────────────────────────────────────────────
    const { txHash } = await stellarService.sendUsdc(
      user.walletAddress,
      withdrawAmount.toFixed(7), // Stellar supports up to 7 decimal places
      `withdraw:${userId.slice(0, 8)}`
    );

    // ── Debit DB balance after confirmation ────────────────────────────────────
    const updatedUser = await prisma.$transaction(async (tx) => {
      return tx.user.update({
        where: { id: userId },
        data: {
          usdcBalance: {
            decrement: withdrawAmount.toNumber(),
          },
        },
      });
    });

    const newBalance = new Decimal(
      updatedUser.usdcBalance.toString()
    ).toNumber();

    logger.info('USDC withdrawal completed', { userId, txHash, newBalance });

    return {
      txHash,
      amountWithdrawn: amount,
      newBalance,
    };
  }
}

export const walletService = new WalletService();
