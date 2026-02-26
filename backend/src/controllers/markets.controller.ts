// backend/src/controllers/markets.controller.ts
// Market controller - handles HTTP requests and delegates to services

import { Response } from 'express';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { MarketService } from '../services/market.service.js';
import { logger } from '../utils/logger.js';
import { MarketCategory } from '@prisma/client';
export class MarketsController {
  private marketService: MarketService;

  constructor() {
    this.marketService = new MarketService();
  }

  /**
   * POST /api/markets - Create a new market
   */
  async createMarket(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Ensure user is authenticated
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
        return;
      }

      // Ensure user has connected wallet
      if (!req.user.publicKey) {
        res.status(400).json({
          success: false,
          error: {
            code: 'WALLET_NOT_CONNECTED',
            message: 'Wallet connection required to create markets',
          },
        });
        return;
      }

      // req.body is already validated and sanitized by middleware
      const {
        title,
        description,
        category,
        outcomeA,
        outcomeB,
        closingAt,
        resolutionTime,
      } = req.body;

      // Create market via service
      const market = await this.marketService.createMarket({
        title,
        description,
        category,
        creatorId: req.user.userId,
        creatorPublicKey: req.user.publicKey,
        outcomeA,
        outcomeB,
        closingAt: new Date(closingAt),
        resolutionTime: resolutionTime ? new Date(resolutionTime) : undefined,
      });

      // Return success response
      res.status(201).json({
        success: true,
        data: {
          id: market.id,
          contractAddress: market.contractAddress,
          title: market.title,
          description: market.description,
          category: market.category,
          status: market.status,
          outcomeA: market.outcomeA,
          outcomeB: market.outcomeB,
          closingAt: market.closingAt,
          createdAt: market.createdAt,
          txHash: market.txHash,
          creatorId: market.creatorId,
        },
      });
    } catch (error) {
      (req.log || logger).error('Create market error', { error });

      // Handle specific errors
      if (error instanceof Error) {
        if (error.message.includes('blockchain')) {
          res.status(503).json({
            success: false,
            error: {
              code: 'BLOCKCHAIN_ERROR',
              message: 'Failed to create market on blockchain',
              details: error.message,
            },
          });
          return;
        }

        if (
          error.message.includes('validation') ||
          error.message.includes('Invalid')
        ) {
          res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: error.message,
            },
          });
          return;
        }
      }

      // Generic error response
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create market',
        },
      });
    }
  }

  /**
   * GET /api/markets - List all markets
   */
  async listMarkets(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const category = req.query.category as MarketCategory | undefined;
      const skip = parseInt(req.query.skip as string) || 0;
      const take = Math.min(parseInt(req.query.take as string) || 20, 100);

      const markets = await this.marketService.listMarkets({
        category,
        skip,
        take,
      });

      res.json({
        success: true,
        data: markets,
        pagination: {
          skip,
          take,
          hasMore: markets.length === take,
        },
      });
    } catch (error) {
      (req.log || logger).error('List markets error', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch markets',
        },
      });
    }
  }

  /**
   * GET /api/markets/:id - Get market details
   */
  async getMarketDetails(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const marketId = req.params.id as string;

      const market = await this.marketService.getMarketDetails(marketId);

      res.json({
        success: true,
        data: market,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Market not found') {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Market not found',
          },
        });
        return;
      }

      (req.log || logger).error('Get market details error', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch market details',
        },
      });
    }
  }

  /**
   * POST /api/markets/:id/pool - Create AMM pool
   */
  async createPool(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // params and body are already validated by middleware
      const marketId = req.params.id as string;
      const { initialLiquidity } = req.body;

      const result = await this.marketService.createPool(
        marketId,
        BigInt(initialLiquidity)
      );

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      (req.log || logger).error('Create pool error', { error });
      res.status(400).json({
        success: false,
        error: {
          code: 'POOL_CREATION_FAILED',
          message:
            error instanceof Error ? error.message : 'Failed to create pool',
        },
      });
    }
  }

  /**
   * PATCH /api/markets/:id/deactivate - Deactivate a market
   */
  async deactivateMarket(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const marketId = req.params.id as string;

      const result = await this.marketService.deactivateMarket(marketId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      (req.log || logger).error('Deactivate market error', { error });

      if (error instanceof Error && error.message === 'Market not found') {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Market not found',
          },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to deactivate market',
        },
      });
    }
  }
}

// Export singleton instance
export const marketsController = new MarketsController();
