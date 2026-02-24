// Shares controller - request handling for portfolio positions
import { Request, Response, NextFunction } from 'express';
import { SharesService } from '../services/shares.service.js';
import { logger } from '../utils/logger.js';

export class SharesController {
  private sharesService: SharesService;

  constructor() {
    this.sharesService = new SharesService();
  }

  /**
   * GET /api/users/:userId/positions
   * Get all positions for a user
   */
  getUserPositions = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { userId } = req.params;
      const { marketId, skip, take } = req.query;

      // Verify user is requesting their own positions or is admin
      if (req.user?.id !== userId && !req.user?.isAdmin) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const positions = await this.sharesService.getUserPositions(userId, {
        marketId: marketId as string | undefined,
        skip: skip ? parseInt(skip as string) : undefined,
        take: take ? parseInt(take as string) : undefined,
      });

      res.json({
        success: true,
        data: positions,
        count: positions.length,
      });
    } catch (error) {
      logger.error('Error fetching user positions', {
        error,
        userId: req.params.userId,
      });
      next(error);
    }
  };

  /**
   * GET /api/users/:userId/positions/:marketId/:outcome
   * Get a specific position
   */
  getPosition = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, marketId, outcome } = req.params;

      // Verify authorization
      if (req.user?.id !== userId && !req.user?.isAdmin) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const position = await this.sharesService.getPosition(
        userId,
        marketId,
        parseInt(outcome)
      );

      res.json({
        success: true,
        data: position,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Position not found') {
        return res.status(404).json({ error: 'Position not found' });
      }
      logger.error('Error fetching position', {
        error,
        params: req.params,
      });
      next(error);
    }
  };

  /**
   * GET /api/users/:userId/portfolio/summary
   * Get portfolio summary with aggregated metrics
   */
  getPortfolioSummary = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { userId } = req.params;

      // Verify authorization
      if (req.user?.id !== userId && !req.user?.isAdmin) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const summary = await this.sharesService.getPortfolioSummary(userId);

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      logger.error('Error fetching portfolio summary', {
        error,
        userId: req.params.userId,
      });
      next(error);
    }
  };

  /**
   * GET /api/users/:userId/portfolio/breakdown
   * Get position breakdown by outcome
   */
  getPositionBreakdown = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { userId } = req.params;

      // Verify authorization
      if (req.user?.id !== userId && !req.user?.isAdmin) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const breakdown = await this.sharesService.getPositionBreakdown(userId);

      res.json({
        success: true,
        data: breakdown,
      });
    } catch (error) {
      logger.error('Error fetching position breakdown', {
        error,
        userId: req.params.userId,
      });
      next(error);
    }
  };

  /**
   * POST /api/users/:userId/portfolio/refresh
   * Refresh all share values based on current AMM prices
   */
  refreshPortfolio = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { userId } = req.params;

      // Verify authorization
      if (req.user?.id !== userId && !req.user?.isAdmin) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const result = await this.sharesService.refreshUserPortfolio(userId);

      res.json({
        success: true,
        message: 'Portfolio refreshed successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Error refreshing portfolio', {
        error,
        userId: req.params.userId,
      });
      next(error);
    }
  };

  /**
   * GET /api/markets/:marketId/positions
   * Get all positions for a specific market (admin only)
   */
  getMarketPositions = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { marketId } = req.params;

      // Admin only endpoint
      if (!req.user?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const positions = await this.sharesService.getMarketPositions(marketId);

      res.json({
        success: true,
        data: positions,
        count: positions.length,
      });
    } catch (error) {
      logger.error('Error fetching market positions', {
        error,
        marketId: req.params.marketId,
      });
      next(error);
    }
  };
}

export const sharesController = new SharesController();
