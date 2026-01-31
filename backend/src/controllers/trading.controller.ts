// backend/src/controllers/trading.controller.ts
// Trading controller - handles trading HTTP requests

import { Request, Response } from 'express';
import { tradingService } from '../services/trading.service.js';
import { AuthenticatedRequest } from '../types/auth.types.js';

class TradingController {
  /**
   * POST /api/markets/:marketId/buy - Buy outcome shares
   */
  async buyShares(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
        return;
      }

      const marketId = req.params.marketId as string;
      const { outcome, amount, minShares } = req.body;

      // Validate input
      if (outcome === undefined || outcome === null) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'outcome is required (0 for NO, 1 for YES)',
          },
        });
        return;
      }

      if (!amount || amount <= 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'amount must be greater than 0',
          },
        });
        return;
      }

      if (![0, 1].includes(outcome)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'outcome must be 0 (NO) or 1 (YES)',
          },
        });
        return;
      }

      // Call service
      const result = await tradingService.buyShares({
        userId,
        marketId,
        outcome,
        amount,
        minShares,
      });

      res.status(201).json({
        success: true,
        data: {
          sharesBought: result.sharesBought,
          pricePerUnit: result.pricePerUnit,
          totalCost: result.totalCost,
          feeAmount: result.feeAmount,
          txHash: result.txHash,
          tradeId: result.tradeId,
          position: result.newSharePosition,
        },
      });
    } catch (error: any) {
      console.error('Error buying shares:', error);

      // Determine appropriate status code
      let statusCode = 500;
      let errorCode = 'INTERNAL_ERROR';

      if (error.message.includes('not found')) {
        statusCode = 404;
        errorCode = 'NOT_FOUND';
      } else if (
        error.message.includes('Insufficient') ||
        error.message.includes('Invalid') ||
        error.message.includes('only allowed')
      ) {
        statusCode = 400;
        errorCode = 'BAD_REQUEST';
      } else if (error.message.includes('Slippage')) {
        statusCode = 400;
        errorCode = 'SLIPPAGE_EXCEEDED';
      } else if (error.message.includes('blockchain')) {
        statusCode = 503;
        errorCode = 'BLOCKCHAIN_ERROR';
      }

      res.status(statusCode).json({
        success: false,
        error: {
          code: errorCode,
          message: error.message || 'Failed to buy shares',
        },
      });
    }
  }

  /**
   * POST /api/markets/:marketId/sell - Sell outcome shares
   */
  async sellShares(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
        return;
      }

      const marketId = req.params.marketId as string;
      const { outcome, shares, minPayout } = req.body;

      // Validate input
      if (outcome === undefined || outcome === null) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'outcome is required (0 for NO, 1 for YES)',
          },
        });
        return;
      }

      if (!shares || shares <= 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'shares must be greater than 0',
          },
        });
        return;
      }

      if (![0, 1].includes(outcome)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'outcome must be 0 (NO) or 1 (YES)',
          },
        });
        return;
      }

      // Call service
      const result = await tradingService.sellShares({
        userId,
        marketId,
        outcome,
        shares,
        minPayout,
      });

      res.status(200).json({
        success: true,
        data: {
          sharesSold: result.sharesSold,
          pricePerUnit: result.pricePerUnit,
          payout: result.payout,
          feeAmount: result.feeAmount,
          txHash: result.txHash,
          tradeId: result.tradeId,
          remainingShares: result.remainingShares,
        },
      });
    } catch (error: any) {
      console.error('Error selling shares:', error);

      // Determine appropriate status code
      let statusCode = 500;
      let errorCode = 'INTERNAL_ERROR';

      if (error.message.includes('not found')) {
        statusCode = 404;
        errorCode = 'NOT_FOUND';
      } else if (
        error.message.includes('Insufficient') ||
        error.message.includes('Invalid') ||
        error.message.includes('No shares')
      ) {
        statusCode = 400;
        errorCode = 'BAD_REQUEST';
      } else if (error.message.includes('Slippage')) {
        statusCode = 400;
        errorCode = 'SLIPPAGE_EXCEEDED';
      } else if (error.message.includes('blockchain')) {
        statusCode = 503;
        errorCode = 'BLOCKCHAIN_ERROR';
      }

      res.status(statusCode).json({
        success: false,
        error: {
          code: errorCode,
          message: error.message || 'Failed to sell shares',
        },
      });
    }
  }

  /**
   * GET /api/markets/:marketId/odds - Get current market odds
   */
  async getOdds(req: Request, res: Response): Promise<void> {
    try {
      const marketId = req.params.marketId as string;

      // Call service
      const result = await tradingService.getMarketOdds(marketId);

      res.status(200).json({
        success: true,
        data: {
          yes: {
            odds: result.yesOdds,
            percentage: result.yesPercentage,
            liquidity: result.yesLiquidity,
          },
          no: {
            odds: result.noOdds,
            percentage: result.noPercentage,
            liquidity: result.noLiquidity,
          },
          totalLiquidity: result.totalLiquidity,
        },
      });
    } catch (error: any) {
      console.error('Error getting odds:', error);

      // Determine appropriate status code
      let statusCode = 500;
      let errorCode = 'INTERNAL_ERROR';

      if (error.message.includes('not found')) {
        statusCode = 404;
        errorCode = 'NOT_FOUND';
      } else if (error.message.includes('blockchain')) {
        statusCode = 503;
        errorCode = 'BLOCKCHAIN_ERROR';
      }

      res.status(statusCode).json({
        success: false,
        error: {
          code: errorCode,
          message: error.message || 'Failed to get odds',
        },
      });
    }
  }
}

export const tradingController = new TradingController();
