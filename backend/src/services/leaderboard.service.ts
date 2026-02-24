// Leaderboard service - business logic for rankings and performance tracking
import { LeaderboardRepository } from '../repositories/leaderboard.repository.js';
import { MarketCategory } from '@prisma/client';
import { logger } from '../utils/logger.js';

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

      // Update general leaderboard stats (all-time, weekly, streaks)
      await this.leaderboardRepository.updateUserStats(userId, pnl, isWin);

      // Update category-specific stats
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
      // After reset, recalculate ranks to reflect 0 ranks
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
}

export const leaderboardService = new LeaderboardService();
