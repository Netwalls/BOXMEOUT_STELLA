// backend/src/controllers/shares.controller.ts
// Shares controller - handles portfolio HTTP requests

import { Request, Response } from 'express';
import { sharesService, SharesService } from '../services/shares.service.js';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { ApiError } from '../middleware/error.middleware.js';

export class SharesController {
  private sharesService: SharesService;

  constructor(sharesSvc?: SharesService) {
    this.sharesService = sharesSvc || sharesService;
  }

  /**
   * GET /api/portfolio - Get user's portfolio summary
   */
  async getPortfolioSummary(req: Request, res: Response): Promise<void> {
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

      const summary = await this.sharesService.getPortfolioSummary(userId);

      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch portfolio summary',
        },
      });
    }
  }

  /**
   * GET /api/portfolio/positions - Get all user positions
   */
  async getUserPositions(req: Request, res: Response): Promise<void> {
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

      const positions = await this.sharesService.getUserPositions(userId);

      res.status(200).json({
        success: true,
        data: {
          positions,
          count: positions.length,
        },
      });
    } catch (error) {
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch positions',
        },
      });
    }
  }

  /**
   * GET /api/portfolio/markets/:marketId - Get positions for a specific market
   */
  async getMarketPositions(req: Request, res: Response): Promise<void> {
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

      const marketId = req.params.marketId;
      if (!marketId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'marketId is required',
          },
        });
        return;
      }

      const positions = await this.sharesService.getMarketPositions(
        userId,
        marketId
      );

      res.status(200).json({
        success: true,
        data: {
          marketId,
          positions,
          count: positions.length,
        },
      });
    } catch (error) {
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch market positions',
        },
      });
    }
  }

  /**
   * POST /api/portfolio/refresh - Refresh all position values
   */
  async refreshPositions(req: Request, res: Response): Promise<void> {
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

      await this.sharesService.refreshAllPositions(userId);

      res.status(200).json({
        success: true,
        message: 'Portfolio positions refreshed successfully',
      });
    } catch (error) {
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to refresh positions',
        },
      });
    }
  }
}

export const sharesController = new SharesController();
