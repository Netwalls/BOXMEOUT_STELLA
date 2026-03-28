// backend/src/services/wallet.service.ts
// Wallet service — handles USDC deposit and withdrawal flows

import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../database/prisma.js';
import { stellarService } from './stellar.service.js';
import { ApiError } from '../middleware/error.middleware.js';
import { logger } from '../utils/logger.js';
import { TransactionStatus, TransactionType } from '@prisma/client';
import { notifyBalanceUpdated } from '../websocket/realtime.js';

// ─── Platform deposit address ─────────────────────────────────────────────────
const PLATFORM_DEPOSIT_ADDRESS = process.env.PLATFORM_DEPOSIT_ADDRESS || '';

export interface WithdrawParams {
  userId: string;
  amount: number; // USDC amount to withdraw
}

export interface WithdrawResult {
  txHash: string;
  amountWithdrawn: number;
  newBalance: number;
}

// ─── Deposit types ─────────────────────────────────────────────────────────────

export interface InitiateDepositResult {
  depositAddress: string;
  memo: string; // User-specific memo for matching on-chain payment
  expiresAt: string; // ISO timestamp — user should send within this window
}

export interface ConfirmDepositParams {
  userId: string;
  txHash: string; // Stellar transaction hash to verify
}

export interface ConfirmDepositResult {
  txHash: string;
  amountDeposited: number;
  newBalance: number;
}

export class WalletService {
  // ==========================================================================
  // DEPOSIT
  // ==========================================================================

  /**
   * Step 1 — Initiate Deposit
   * Returns the platform address + a user-specific memo so the user knows
   * exactly where and how to send USDC on-chain.
   *
   * Flow:
   * 1. User calls POST /api/wallet/deposit/initiate
   * 2. Backend returns { depositAddress, memo }
   * 3. User sends USDC on Stellar with that memo
   * 4. User calls POST /api/wallet/deposit/confirm with the txHash
   */
  async initiateDeposit(userId: string): Promise<InitiateDepositResult> {
    if (!PLATFORM_DEPOSIT_ADDRESS) {
      throw new ApiError(
        503,
        'DEPOSIT_UNAVAILABLE',
        'Deposit service is not configured. Please contact support.'
      );
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
    }

    // Deterministic per-user memo: short hex prefix of userId
    const memo = `dep:${userId.slice(0, 8)}`;

    // 24h window to send the payment
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    logger.info('Deposit initiated', {
      userId,
      memo,
      depositAddress: PLATFORM_DEPOSIT_ADDRESS,
    });

    return {
      depositAddress: PLATFORM_DEPOSIT_ADDRESS,
      memo,
      expiresAt,
    };
  }

  /**
   * Step 2 — Confirm Deposit
   * Verifies the on-chain Stellar transaction:
   *   - Checks it's a USDC payment to the platform address
   *   - Checks the memo matches the user's deposit memo
   *   - Idempotent: duplicate txHash submissions are rejected
   *
   * On success:
   *   - Credits user.usdcBalance
   *   - Records a CONFIRMED Transaction entity
   *   - Emits portfolio balance_updated WebSocket event
   */
  async confirmDeposit(
    params: ConfirmDepositParams
  ): Promise<ConfirmDepositResult> {
    const { userId, txHash } = params;

    if (!txHash || typeof txHash !== 'string' || txHash.trim().length === 0) {
      throw new ApiError(400, 'INVALID_TX_HASH', 'txHash is required');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
    }

    if (!user.walletAddress) {
      throw new ApiError(
        400,
        'WALLET_NOT_CONNECTED',
        'Connect a Stellar wallet before depositing.'
      );
    }

    // Idempotency: reject if this txHash was already processed
    const existing = await prisma.transaction.findFirst({
      where: { txHash, userId },
    });
    if (existing) {
      if (existing.status === TransactionStatus.CONFIRMED) {
        throw new ApiError(
          409,
          'TX_ALREADY_PROCESSED',
          'This transaction has already been credited.'
        );
      }
      // PENDING/FAILED: allow re-verification below
    }

    // ── Verify on-chain via Horizon ────────────────────────────────────────────
    const depositVerification = await this.verifyDepositTx({
      txHash,
      expectedSender: user.walletAddress,
      expectedMemo: `dep:${userId.slice(0, 8)}`,
    });

    if (!depositVerification.valid) {
      // Record as failed for audit
      await this.recordTransaction({
        userId,
        txHash,
        amountUsdc: 0,
        status: TransactionStatus.FAILED,
        fromAddress: user.walletAddress,
        toAddress: PLATFORM_DEPOSIT_ADDRESS,
        failedReason: depositVerification.reason,
      });
      throw new ApiError(
        400,
        'DEPOSIT_VERIFICATION_FAILED',
        depositVerification.reason ?? 'Transaction could not be verified'
      );
    }

    const amountDeposited = depositVerification.amount!;

    // ── Credit balance + record transaction atomically ─────────────────────────
    const updatedUser = await prisma.$transaction(async (tx) => {
      // Upsert transaction record (handles re-verification of PENDING)
      await tx.transaction.upsert({
        where: { id: existing?.id ?? '' },
        create: {
          userId,
          txType: TransactionType.DEPOSIT,
          amountUsdc: amountDeposited,
          status: TransactionStatus.CONFIRMED,
          txHash,
          fromAddress: user.walletAddress!,
          toAddress: PLATFORM_DEPOSIT_ADDRESS,
          confirmedAt: new Date(),
        },
        update: {
          status: TransactionStatus.CONFIRMED,
          amountUsdc: amountDeposited,
          confirmedAt: new Date(),
        },
      });

      // Credit user balance
      return tx.user.update({
        where: { id: userId },
        data: { usdcBalance: { increment: amountDeposited } },
      });
    });

    const newBalance = new Decimal(
      updatedUser.usdcBalance.toString()
    ).toNumber();

    logger.info('USDC deposit confirmed', {
      userId,
      txHash,
      amountDeposited,
      newBalance,
    });

    // Portfolio real-time update
    notifyBalanceUpdated(userId, {
      usdcBalance: newBalance,
      reason: 'deposit',
      amountDelta: amountDeposited,
    });

    return { txHash, amountDeposited, newBalance };
  }

  // ==========================================================================
  // ON-CHAIN VERIFICATION (Stellar Horizon)
  // ==========================================================================

  private async verifyDepositTx(params: {
    txHash: string;
    expectedSender: string;
    expectedMemo: string;
  }): Promise<{ valid: boolean; amount?: number; reason?: string }> {
    const { txHash, expectedSender, expectedMemo } = params;

    if (!PLATFORM_DEPOSIT_ADDRESS) {
      return {
        valid: false,
        reason: 'Platform deposit address not configured',
      };
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Horizon, Asset } = await import('@stellar/stellar-sdk');
      const STELLAR_HORIZON_URL =
        process.env.STELLAR_HORIZON_URL ||
        'https://horizon-testnet.stellar.org';
      const USDC_ISSUER =
        process.env.USDC_ISSUER ||
        'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

      const server = new Horizon.Server(STELLAR_HORIZON_URL);
      const txRecord = await server.transactions().transaction(txHash).call();

      // Verify memo matches user deposit memo
      if (txRecord.memo !== expectedMemo) {
        return {
          valid: false,
          reason: `Memo mismatch: expected "${expectedMemo}", got "${txRecord.memo}"`,
        };
      }

      // Verify source account is the user's wallet
      if (txRecord.source_account !== expectedSender) {
        return {
          valid: false,
          reason: `Source account mismatch: expected ${expectedSender}, got ${txRecord.source_account}`,
        };
      }

      // Fetch operations to find USDC payment to platform address
      const ops = await server.operations().forTransaction(txHash).call();
      const usdcAsset = new Asset('USDC', USDC_ISSUER);

      let depositAmount: number | undefined;
      for (const op of ops.records) {
        const payment = op as any;
        if (
          payment.type === 'payment' &&
          payment.to === PLATFORM_DEPOSIT_ADDRESS &&
          payment.asset_code === 'USDC' &&
          payment.asset_issuer === USDC_ISSUER
        ) {
          depositAmount = parseFloat(payment.amount);
          break;
        }
      }

      if (depositAmount === undefined || depositAmount <= 0) {
        return {
          valid: false,
          reason: 'No USDC payment to platform address found in transaction',
        };
      }

      return { valid: true, amount: depositAmount };
    } catch (error: any) {
      logger.warn('Stellar Horizon verification failed', {
        txHash,
        error: error.message,
      });

      // In development/test without a live Horizon, allow mock hashes
      if (
        process.env.NODE_ENV !== 'production' &&
        txHash.startsWith('mock-deposit-')
      ) {
        const mockAmount = parseFloat(txHash.split('-')[2] ?? '10') || 10;
        return { valid: true, amount: mockAmount };
      }

      return {
        valid: false,
        reason: `Horizon verification error: ${error.message ?? 'Unknown error'}`,
      };
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private async recordTransaction(params: {
    userId: string;
    txHash: string;
    amountUsdc: number;
    status: TransactionStatus;
    fromAddress: string;
    toAddress: string;
    failedReason?: string;
  }) {
    try {
      await prisma.transaction.create({
        data: {
          userId: params.userId,
          txType: TransactionType.DEPOSIT,
          amountUsdc: params.amountUsdc,
          status: params.status,
          txHash: params.txHash,
          fromAddress: params.fromAddress,
          toAddress: params.toAddress,
          failedReason: params.failedReason,
          confirmedAt:
            params.status === TransactionStatus.CONFIRMED
              ? new Date()
              : undefined,
        },
      });
    } catch (err) {
      logger.error('Failed to record transaction', { params, err });
    }
  }

  // ==========================================================================
  // WITHDRAW (existing — kept unchanged, only types added above)
  // ==========================================================================

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

    // ── Debit DB balance + record transaction ──────────────────────────────────
    const updatedUser = await prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          userId,
          txType: TransactionType.WITHDRAW,
          amountUsdc: amount,
          status: TransactionStatus.CONFIRMED,
          txHash,
          fromAddress: PLATFORM_DEPOSIT_ADDRESS || 'platform',
          toAddress: user.walletAddress!,
          confirmedAt: new Date(),
        },
      });

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

    // Portfolio real-time update
    notifyBalanceUpdated(userId, {
      usdcBalance: newBalance,
      reason: 'withdrawal',
      amountDelta: -amount,
    });

    return {
      txHash,
      amountWithdrawn: amount,
      newBalance,
    };
  }

  // ==========================================================================
  // GET BALANCE
  // ==========================================================================

  /**
   * Get user's wallet balance (on-chain and off-chain)
   *
   * Returns:
   * - onChainBalance: Balance from Stellar blockchain
   * - offChainBalance: Balance stored in DB (platform balance)
   * - lockedBalance: Amount locked in active predictions/trades
   * - currency: Always "USDC"
   */
  async getBalance(userId: string): Promise<{
    onChainBalance: number;
    offChainBalance: number;
    lockedBalance: number;
    currency: string;
  }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
    }

    // Off-chain balance from DB
    const offChainBalance = new Decimal(user.usdcBalance.toString()).toNumber();

    // On-chain balance (would require Stellar API call in production)
    // For now, return 0 or fetch from Stellar if wallet is connected
    let onChainBalance = 0;
    if (user.walletAddress) {
      try {
        // In production, fetch from Stellar Horizon
        // For now, we'll return 0 as a placeholder
        onChainBalance = 0;
      } catch (error) {
        logger.warn('Failed to fetch on-chain balance', { userId, error });
        onChainBalance = 0;
      }
    }

    // Calculate locked balance from active predictions
    const lockedPredictions = await prisma.prediction.findMany({
      where: {
        userId,
        status: { in: ['COMMITTED', 'REVEALED'] },
      },
      select: { amountUsdc: true },
    });

    const lockedBalance = lockedPredictions.reduce((sum, pred) => {
      return sum + new Decimal(pred.amountUsdc.toString()).toNumber();
    }, 0);

    logger.info('Balance retrieved', {
      userId,
      onChainBalance,
      offChainBalance,
      lockedBalance,
    });

    return {
      onChainBalance,
      offChainBalance,
      lockedBalance,
      currency: 'USDC',
    };
  }

  // ==========================================================================
  // GET TRANSACTION HISTORY
  // ==========================================================================

  /**
   * Get paginated transaction history for user
   *
   * Supports filtering by:
   * - type: DEPOSIT, WITHDRAW, REWARD, REFUND
   * - from/to: Date range
   *
   * Returns paginated results with total count
   */
  async getTransactions(params: {
    userId: string;
    page: number;
    limit: number;
    type?: TransactionType;
    from?: Date;
    to?: Date;
  }): Promise<{
    transactions: any[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  }> {
    const { userId, page, limit, type, from, to } = params;

    // Validate user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
    }

    // Build where clause
    const where: any = { userId };
    if (type) {
      where.txType = type;
    }
    if (from || to) {
      where.createdAt = {};
      if (from) {
        where.createdAt.gte = from;
      }
      if (to) {
        where.createdAt.lte = to;
      }
    }

    // Get total count
    const total = await prisma.transaction.count({ where });

    // Get paginated results
    const skip = (page - 1) * limit;
    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        txType: true,
        amountUsdc: true,
        status: true,
        txHash: true,
        fromAddress: true,
        toAddress: true,
        createdAt: true,
        confirmedAt: true,
        failedReason: true,
      },
    });

    const hasMore = skip + limit < total;

    logger.info('Transactions retrieved', {
      userId,
      page,
      limit,
      total,
      count: transactions.length,
    });

    return {
      transactions: transactions.map((tx) => ({
        ...tx,
        amountUsdc: new Decimal(tx.amountUsdc.toString()).toNumber(),
      })),
      total,
      page,
      limit,
      hasMore,
    };
  }
}

export const walletService = new WalletService();
