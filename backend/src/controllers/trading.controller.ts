// backend/src/controllers/trading.controller.ts
// Trading controller - handles trading HTTP requests (both direct and user-signed flow)

import { Request, Response } from 'express';
import { tradingService } from '../services/trading.service.js';
import { AuthenticatedRequest } from '../types/auth.types.js';
import logger from '../utils/logger.js';

export class TradingController {
  /**
   * POST /api/markets/:marketId/build-tx/buy
   * Build an unsigned transaction for buying shares
   */
  async buildBuySharesTx(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.userId;
      const userPublicKey = authReq.user?.publicKey;

      if (!userId || !userPublicKey) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const marketId = req.params.marketId as string;
      const { outcome, amount, minShares } = req.body;

      // Validation
      if (outcome === undefined || !amount) {
        res
          .status(400)
          .json({ success: false, error: 'Missing outcome or amount' });
        return;
      }

      const xdr = await tradingService.buildBuySharesTx(
        userId,
        userPublicKey,
        marketId,
        Number(outcome),
        BigInt(amount),
        BigInt(minShares || 0)
      );

      res.status(200).json({
        success: true,
        data: { xdr },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/markets/:marketId/buy - Buy outcome shares (Direct/Admin-signed)
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
   * POST /api/markets/:marketId/build-tx/sell
   * Build an unsigned transaction for selling shares
   */
  async buildSellSharesTx(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.userId;
      const userPublicKey = authReq.user?.publicKey;

      if (!userId || !userPublicKey) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const marketId = req.params.marketId as string;
      const { outcome, shares, minPayout } = req.body;

      if (outcome === undefined || !shares) {
        res
          .status(400)
          .json({ success: false, error: 'Missing outcome or shares' });
        return;
      }

      const xdr = await tradingService.buildSellSharesTx(
        userId,
        userPublicKey,
        marketId,
        Number(outcome),
        BigInt(shares),
        BigInt(minPayout || 0)
      );

      res.status(200).json({
        success: true,
        data: { xdr },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/markets/:marketId/sell - Sell outcome shares (Direct/Admin-signed)
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
   * POST /api/submit-signed-tx
   * Submit a pre-signed transaction
   */
  async submitSignedTx(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.userId;
      const userPublicKey = authReq.user?.publicKey;

      if (!userId || !userPublicKey) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { signedXdr, action } = req.body;

      if (!signedXdr || !action) {
        res
          .status(400)
          .json({ success: false, error: 'Missing signedXdr or action' });
        return;
      }

      const result = await tradingService.submitSignedTx(
        userId,
        userPublicKey,
        signedXdr,
        action
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message,
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

  /**
   * POST /api/markets/:marketId/liquidity/add - Add USDC liquidity to an AMM pool
   */
  async addLiquidity(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
        return;
      }

      const marketId = req.params.marketId as string;
      const { usdcAmount } = req.body;

      if (!usdcAmount) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'usdcAmount is required',
          },
        });
        return;
      }

      let parsedAmount: bigint;
      try {
        parsedAmount = BigInt(usdcAmount);
      } catch {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'usdcAmount must be a valid integer string',
          },
        });
        return;
      }

      if (parsedAmount <= BigInt(0)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'usdcAmount must be greater than 0',
          },
        });
        return;
      }

      const result = await tradingService.addLiquidity(
        userId,
        marketId,
        parsedAmount
      );

      res.status(200).json({
        success: true,
        data: {
          lpTokensMinted: result.lpTokensMinted.toString(),
          txHash: result.txHash,
        },
      });
    } catch (error: any) {
      console.error('Error adding liquidity:', error);

      let statusCode = 500;
      let errorCode = 'INTERNAL_ERROR';

      if (error.message.includes('not found')) {
        statusCode = 404;
        errorCode = 'NOT_FOUND';
      } else if (
        error.message.includes('must be') ||
        error.message.includes('OPEN')
      ) {
        statusCode = 400;
        errorCode = 'BAD_REQUEST';
      } else if (error.message.includes('blockchain')) {
        statusCode = 503;
        errorCode = 'BLOCKCHAIN_ERROR';
      }

      res.status(statusCode).json({
        success: false,
        error: {
          code: errorCode,
          message: error.message || 'Failed to add liquidity',
        },
      });
    }
  }

  /**
   * POST /api/markets/:marketId/liquidity/remove - Remove liquidity from an AMM pool
   */
  async removeLiquidity(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
        return;
      }

      const marketId = req.params.marketId as string;
      const { lpTokens } = req.body;

      if (!lpTokens) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'lpTokens is required',
          },
        });
        return;
      }

      let parsedTokens: bigint;
      try {
        parsedTokens = BigInt(lpTokens);
      } catch {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'lpTokens must be a valid integer string',
          },
        });
        return;
      }

      if (parsedTokens <= BigInt(0)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'lpTokens must be greater than 0',
          },
        });
        return;
      }

      const result = await tradingService.removeLiquidity(
        userId,
        marketId,
        parsedTokens
      );

      res.status(200).json({
        success: true,
        data: {
          yesAmount: result.yesAmount.toString(),
          noAmount: result.noAmount.toString(),
          totalUsdcReturned: result.totalUsdcReturned.toString(),
          txHash: result.txHash,
        },
      });
    } catch (error: any) {
      console.error('Error removing liquidity:', error);

      let statusCode = 500;
      let errorCode = 'INTERNAL_ERROR';

      if (error.message.includes('not found')) {
        statusCode = 404;
        errorCode = 'NOT_FOUND';
      } else if (
        error.message.includes('must be') ||
        error.message.includes('Insufficient') ||
        error.message.includes('drain')
      ) {
        statusCode = 400;
        errorCode = 'BAD_REQUEST';
      } else if (error.message.includes('blockchain')) {
        statusCode = 503;
        errorCode = 'BLOCKCHAIN_ERROR';
      }

      res.status(statusCode).json({
        success: false,
        error: {
          code: errorCode,
          message: error.message || 'Failed to remove liquidity',
        },
      });
    }
  }
}

export const tradingController = new TradingController();
