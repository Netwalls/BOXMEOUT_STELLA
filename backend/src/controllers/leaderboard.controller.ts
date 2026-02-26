// Leaderboard Controller - handles ranking and performance requests
import { Request, Response } from 'express';
import { leaderboardService } from '../services/leaderboard.service.js';
import { MarketCategory } from '@prisma/client';
import { logger } from '../utils/logger.js';

export class LeaderboardController {
  /**
   * GET /api/leaderboard/global
   */
  async getGlobal(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      const leaderboard = await leaderboardService.getGlobalLeaderboard(
        limit,
        offset
      );

      return res.status(200).json({
        success: true,
        data: leaderboard,
        pagination: { limit, offset },
      });
    } catch (error) {
      logger.error('LeaderboardController.getGlobal error', { error });
      return res
        .status(500)
        .json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * GET /api/leaderboard/weekly
   */
  async getWeekly(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      const leaderboard = await leaderboardService.getWeeklyLeaderboard(
        limit,
        offset
      );

      return res.status(200).json({
        success: true,
        data: leaderboard,
        pagination: { limit, offset },
      });
    } catch (error) {
      logger.error('LeaderboardController.getWeekly error', { error });
      return res
        .status(500)
        .json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * GET /api/leaderboard/category/:category
   */
  async getByCategory(req: Request, res: Response) {
    try {
      const { category } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      if (!Object.values(MarketCategory).includes(category as MarketCategory)) {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid category' });
      }

      const leaderboard = await leaderboardService.getCategoryLeaderboard(
        category as MarketCategory,
        limit,
        offset
      );

      return res.status(200).json({
        success: true,
        data: leaderboard,
        pagination: { limit, offset, category },
      });
    } catch (error) {
      logger.error('LeaderboardController.getByCategory error', { error });
      return res
        .status(500)
        .json({ success: false, message: 'Internal server error' });
    }
  }
}

export const leaderboardController = new LeaderboardController();
