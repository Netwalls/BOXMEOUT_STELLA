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

      const xdr = await tradingService.buildBuySharesTx(
        userId,
        userPublicKey,
        marketId,
        outcome,
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
   * POST /trading/buy - Buy outcome shares (Direct/Admin-signed)
   * Custom endpoint requested by user
   */
  async buySharesNew(req: Request, res: Response): Promise<void> {
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

      const { marketId, outcomeId, collateralAmount, minSharesOut } = req.body;

      if (!marketId || outcomeId === undefined || !collateralAmount) {
        res.status(400).json({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'marketId, outcomeId, and collateralAmount are required',
          },
        });
        return;
      }

      // Call service
      const result = await tradingService.buyShares({
        userId,
        marketId,
        outcome: Number(outcomeId),
        amount: Number(collateralAmount),
        minShares: minSharesOut ? Number(minSharesOut) : undefined,
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
      console.error('Error buying shares (new):', error);

      let statusCode = 500;
      let errorCode = 'INTERNAL_ERROR';

      if (error.message.includes('not found')) {
        statusCode = 404;
        errorCode = 'NOT_FOUND';
      } else if (
        error.message.includes('Insufficient') ||
        error.message.includes('Invalid') ||
        error.message.includes('only allowed') ||
        error.message.includes('too small')
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
   * GET /trading/quote - Preview the output of a trade
   * Query: marketId, outcomeId, amount, side (buy|sell)
   */
  async getQuote(req: Request, res: Response): Promise<void> {
    try {
      const { marketId, outcomeId, amount, side } = req.query;

      if (!marketId || outcomeId === undefined || !amount || !side) {
        res.status(400).json({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'marketId, outcomeId, amount, and side (buy|sell) are required',
          },
        });
        return;
      }

      if (side !== 'buy' && side !== 'sell') {
        res.status(400).json({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'side must be "buy" or "sell"',
          },
        });
        return;
      }

      const quoteResult = await tradingService.getQuote({
        marketId: marketId as string,
        outcome: Number(outcomeId),
        amount: Number(amount),
        side: side as 'buy' | 'sell',
      });

      res.status(200).json({
        success: true,
        data: quoteResult,
      });
    } catch (error: any) {
      console.error('Error getting trade quote:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Failed to get trade quote',
        },
      });
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

      // Call service
      const result = await tradingService.buyShares({
        userId,
        marketId,
        outcome,
        amount: Number(amount),
        minShares: minShares ? Number(minShares) : undefined,
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

      const xdr = await tradingService.buildSellSharesTx(
        userId,
        userPublicKey,
        marketId,
        outcome,
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

      // Call service
      const result = await tradingService.sellShares({
        userId,
        marketId,
        outcome,
        shares: Number(shares),
        minPayout: minPayout ? Number(minPayout) : undefined,
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

      const result = await tradingService.addLiquidity(
        userId,
        marketId,
        BigInt(usdcAmount)
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

      const result = await tradingService.removeLiquidity(
        userId,
        marketId,
        BigInt(lpTokens)
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

  /**
   * GET /trading/history - Get authenticated user's trade history
   */
  async getHistory(req: Request, res: Response): Promise<void> {
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

      const page = Number(req.query.page) || 1;
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const outcomeId = req.query.outcomeId ? Number(req.query.outcomeId) : undefined;

      const result = await tradingService.getUserTradeHistory(userId, {
        page,
        limit,
        outcomeId,
      });

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      console.error('Error fetching trade history:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Failed to fetch trade history',
        },
      });
    }
  }

  /**
   * GET /api/markets/:marketId/trades - Get public trade history for a market
   */
  async getMarketTrades(req: Request, res: Response): Promise<void> {
    try {
      const marketId = req.params.marketId as string;
      const page = Number(req.query.page) || 1;
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const outcomeId = req.query.outcomeId ? Number(req.query.outcomeId) : undefined;

      const result = await tradingService.getMarketTradeHistory(marketId, {
        page,
        limit,
        outcomeId,
      });

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      console.error('Error fetching market trades:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Failed to fetch market trades',
        },
      });
    }
  }
}

export const tradingController = new TradingController();
