// backend/src/controllers/markets.controller.ts
// Market controller - handles HTTP requests and delegates to services

import { Response } from 'express';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { MarketService } from '../services/market.service.js';
import { MarketCategory, MarketStatus } from '@prisma/client';
import { z } from 'zod';

// Validation schema for market creation
const createMarketSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(10).max(5000),
  category: z.nativeEnum(MarketCategory),
  outcomeA: z.string().min(1).max(100),
  outcomeB: z.string().min(1).max(100),
  closingAt: z.string().datetime(),
  resolutionTime: z.string().datetime().optional(),
});

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

      // Validate request body
      const validation = createMarketSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: validation.error.errors,
          },
        });
        return;
      }

      const data = validation.data;

      // Parse timestamps
      const closingAt = new Date(data.closingAt);
      const resolutionTime = data.resolutionTime
        ? new Date(data.resolutionTime)
        : undefined;

      // Validate timestamps are in the future
      const now = new Date();
      if (closingAt <= now) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TIMESTAMP',
            message: 'Closing time must be in the future',
          },
        });
        return;
      }

      if (resolutionTime && resolutionTime <= closingAt) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TIMESTAMP',
            message: 'Resolution time must be after closing time',
          },
        });
        return;
      }

      // Create market via service
      const market = await this.marketService.createMarket({
        title: data.title,
        description: data.description,
        category: data.category,
        creatorId: req.user.userId,
        creatorPublicKey: req.user.publicKey,
        outcomeA: data.outcomeA,
        outcomeB: data.outcomeB,
        closingAt,
        resolutionTime,
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
      console.error('Create market error:', error);

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
      console.error('List markets error:', error);
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

      console.error('Get market details error:', error);
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
      const marketId = req.params.id as string;
      const { initialLiquidity } = req.body;

      if (!initialLiquidity || BigInt(initialLiquidity) <= 0n) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_LIQUIDITY',
            message: 'Initial liquidity must be greater than 0',
          },
        });
        return;
      }

      const result = await this.marketService.createPool(
        marketId,
        BigInt(initialLiquidity)
      );

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Create pool error:', error);
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
}

// Export singleton instance
export const marketsController = new MarketsController();
