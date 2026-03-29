// Leaderboard service - business logic for rankings and performance tracking
import { LeaderboardRepository } from '../repositories/leaderboard.repository.js';
import { MarketCategory } from '@prisma/client';
import { getRedisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';

const CACHE_TTL = 300; // 5 minutes

export class LeaderboardService {
  private leaderboardRepository: LeaderboardRepository;

  constructor(leaderboardRepository?: LeaderboardRepository) {
    this.leaderboardRepository =
      leaderboardRepository || new LeaderboardRepository();
  }

  /**
   * Updates user leaderboard stats after a market prediction is settled
   */
  async handleSettlement(
    userId: string,
    marketId: string,
    category: MarketCategory,
    pnl: number,
    isWin: boolean
  ) {
    try {
      logger.info('Updating leaderboard stats for user', {
        userId,
        marketId,
        pnl,
        isWin,
      });

      await this.leaderboardRepository.updateUserStats(userId, pnl, isWin);
      await this.leaderboardRepository.updateCategoryStats(
        userId,
        category,
        pnl,
        isWin
      );

      return true;
    } catch (error) {
      logger.error('Failed to update leaderboard stats', {
        userId,
        marketId,
        error,
      });
      return false;
    }
  }

  /**
   * Triggers a complete recalculation of ranks across all leaderboards
   */
  async calculateRanks() {
    try {
      logger.info('Recalculating all leaderboard ranks');
      await this.leaderboardRepository.updateAllRanks();
      return true;
    } catch (error) {
      logger.error('Failed to recalculate ranks', { error });
      return false;
    }
  }

  /**
   * Resets weekly rankings (should be called by a CRON job)
   */
  async resetWeeklyRankings() {
    try {
      logger.info('Resetting weekly leaderboard stats');
      await this.leaderboardRepository.resetWeeklyStats();
      await this.leaderboardRepository.updateAllRanks();
      return true;
    } catch (error) {
      logger.error('Failed to reset weekly rankings', { error });
      return false;
    }
  }

  async getGlobalLeaderboard(limit: number = 100, offset: number = 0) {
    return await this.leaderboardRepository.getGlobal(limit, offset);
  }

  async getWeeklyLeaderboard(limit: number = 100, offset: number = 0) {
    return await this.leaderboardRepository.getWeekly(limit, offset);
  }

  async getCategoryLeaderboard(
    category: MarketCategory,
    limit: number = 100,
    offset: number = 0
  ) {
    return await this.leaderboardRepository.getByCategory(
      category,
      limit,
      offset
    );
  }

  /**
   * GET /leaderboard — returns top 100 users with metric/period filtering, cached in Redis
   */
  async getRankedLeaderboard(params: {
    metric: 'profit' | 'accuracy' | 'wins';
    period: 'all' | 'weekly' | 'monthly';
    limit?: number;
  }) {
    const { metric, period, limit = 100 } = params;
    const cacheKey = `leaderboard:${metric}:${period}:${limit}`;

    try {
      const redis = getRedisClient();
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      logger.warn('Redis cache miss for leaderboard', { cacheKey, err });
    }

    const entries = await this.leaderboardRepository.getRanked({
      metric,
      period,
      limit,
    });

    try {
      const redis = getRedisClient();
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(entries));
    } catch (err) {
      logger.warn('Failed to cache leaderboard', { cacheKey, err });
    }

    return entries;
  }

  /**
   * Returns the authenticated user's rank and stats
   */
  async getUserRank(userId: string) {
    return await this.leaderboardRepository.getUserRank(userId);
  }

  /**
   * Awards accuracy points to a user after prediction settlement (issue #20).
   * Winners earn points proportional to their stake; losers earn 0.
   * Also triggers a full rank recalculation.
   */
  async awardAccuracyPoints(
    userId: string,
    marketId: string,
    category: MarketCategory,
    isWinner: boolean,
    pnlUsd: number
  ): Promise<void> {
    try {
      await this.leaderboardRepository.updateUserStats(userId, pnlUsd, isWinner);
      await this.leaderboardRepository.updateCategoryStats(userId, category, pnlUsd, isWinner);
      logger.info('Accuracy points awarded', { userId, marketId, isWinner, pnlUsd });
    } catch (error) {
      logger.error('Failed to award accuracy points', { userId, marketId, error });
    }
  }
}

export const leaderboardService = new LeaderboardService();
