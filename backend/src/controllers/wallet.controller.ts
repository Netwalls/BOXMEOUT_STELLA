// backend/src/controllers/wallet.controller.ts
// Wallet controller — request/response layer for wallet operations

import { Response } from 'express';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { walletService } from '../services/wallet.service.js';
import { ApiError } from '../middleware/error.middleware.js';
import { logger } from '../utils/logger.js';

export class WalletController {
  /**
   * POST /api/wallet/withdraw
   *
   * Body: { amount: number }
   * Response: { success: true, data: { txHash, amountWithdrawn, newBalance } }
   */
  async withdraw(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.userId;

    if (!userId) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    const { amount } = req.body as { amount?: unknown };

    // Validate amount type and value
    if (amount === undefined || amount === null) {
      throw new ApiError(400, 'MISSING_AMOUNT', 'amount is required');
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      throw new ApiError(
        400,
        'INVALID_AMOUNT',
        'amount must be a positive number'
      );
    }

    logger.info('Withdrawal request received', {
      userId,
      amount: parsedAmount,
    });

    const result = await walletService.withdraw({
      userId,
      amount: parsedAmount,
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  }
}

export const walletController = new WalletController();
