// Transaction controller - handles HTTP requests for transaction endpoints
import { Request, Response } from 'express';
import { TransactionService } from '../services/transaction.service.js';
import { TransactionType, TransactionStatus } from '@prisma/client';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    publicKey: string;
    tier: string;
  };
}

export class TransactionController {
  private transactionService: TransactionService;

  constructor() {
    this.transactionService = new TransactionService();
  }

  /**
   * GET /api/transactions
   * Get transaction history with pagination and filters
   */
  async getTransactionHistory(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'NOT_AUTHENTICATED',
            message: 'Authentication required',
          },
        });
        return;
      }

      const { page, limit, type, status, startDate, endDate } = req.query;

      const options: any = {};

      if (page) options.page = parseInt(page as string);
      if (limit) options.limit = parseInt(limit as string);
      if (
        type &&
        Object.values(TransactionType).includes(type as TransactionType)
      ) {
        options.txType = type as TransactionType;
      }
      if (
        status &&
        Object.values(TransactionStatus).includes(status as TransactionStatus)
      ) {
        options.status = status as TransactionStatus;
      }
      if (startDate) options.startDate = startDate as string;
      if (endDate) options.endDate = endDate as string;

      const result = await this.transactionService.getTransactionHistory(
        req.user.userId,
        options
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * GET /api/transactions/:id
   * Get a specific transaction by ID
   */
  async getTransactionById(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'NOT_AUTHENTICATED',
            message: 'Authentication required',
          },
        });
        return;
      }

      const { id } = req.params;

      const transaction = await this.transactionService.getTransactionById(id);

      // Verify user owns this transaction
      if (transaction.userId !== req.user.userId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied',
          },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: transaction,
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * POST /api/transactions
   * Record a new transaction
   */
  async recordTransaction(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'NOT_AUTHENTICATED',
            message: 'Authentication required',
          },
        });
        return;
      }

      const { txType, amountUsdc, txHash, fromAddress, toAddress } = req.body;

      // Validate required fields
      if (!txType || !amountUsdc || !txHash || !fromAddress || !toAddress) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message:
              'txType, amountUsdc, txHash, fromAddress, and toAddress are required',
          },
        });
        return;
      }

      // Validate transaction type
      if (!Object.values(TransactionType).includes(txType)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TYPE',
            message: 'Invalid transaction type',
          },
        });
        return;
      }

      const transaction = await this.transactionService.recordTransaction({
        userId: req.user.userId,
        txType,
        amountUsdc: parseFloat(amountUsdc),
        txHash,
        fromAddress,
        toAddress,
      });

      res.status(201).json({
        success: true,
        data: transaction,
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * GET /api/transactions/pending
   * Get pending transactions for current user
   */
  async getPendingTransactions(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'NOT_AUTHENTICATED',
            message: 'Authentication required',
          },
        });
        return;
      }

      const transactions = await this.transactionService.getPendingTransactions(
        req.user.userId
      );

      res.status(200).json({
        success: true,
        data: { transactions },
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * Centralized error handler
   */
  private handleError(error: unknown, res: Response): void {
    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: error.message,
        },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
}

// Singleton instance
export const transactionController = new TransactionController();
