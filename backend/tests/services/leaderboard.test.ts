import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeaderboardService } from '../../src/services/leaderboard.service.js';
import { MarketCategory } from '@prisma/client';

describe('Leaderboard Service Logic', () => {
  let leaderboardService: LeaderboardService;
  let mockLeaderboardRepository: any;

  beforeEach(() => {
    mockLeaderboardRepository = {
      updateUserStats: vi.fn(),
      updateCategoryStats: vi.fn(),
      updateAllRanks: vi.fn(),
      resetWeeklyStats: vi.fn(),
    };

    leaderboardService = new LeaderboardService(mockLeaderboardRepository);
  });

  describe('handleSettlement', () => {
    it('should call repository methods with correct data', async () => {
      const userId = 'user-1';
      const marketId = 'market-1';
      const category = MarketCategory.MMA;
      const pnl = 100.5;
      const isWin = true;

      await leaderboardService.handleSettlement(
        userId,
        marketId,
        category,
        pnl,
        isWin
      );

      expect(mockLeaderboardRepository.updateUserStats).toHaveBeenCalledWith(
        userId,
        pnl,
        isWin
      );
      expect(
        mockLeaderboardRepository.updateCategoryStats
      ).toHaveBeenCalledWith(userId, category, pnl, isWin);
    });

    it('should handle errors gracefully', async () => {
      const userId = 'user-1';
      mockLeaderboardRepository.updateUserStats.mockRejectedValue(
        new Error('DB Error')
      );

      const result = await leaderboardService.handleSettlement(
        userId,
        'm1',
        MarketCategory.BOXING,
        10,
        true
      );

      expect(result).toBe(false);
    });
  });

  describe('calculateRanks', () => {
    it('should call repository.updateAllRanks', async () => {
      await leaderboardService.calculateRanks();
      expect(mockLeaderboardRepository.updateAllRanks).toHaveBeenCalled();
    });
  });

  describe('resetWeeklyRankings', () => {
    it('should reset stats and then recalculate ranks', async () => {
      await leaderboardService.resetWeeklyRankings();
      expect(mockLeaderboardRepository.resetWeeklyStats).toHaveBeenCalled();
      expect(mockLeaderboardRepository.updateAllRanks).toHaveBeenCalled();
    });
  });
});
