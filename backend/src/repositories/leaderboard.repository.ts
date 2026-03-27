// Leaderboard repository - data access layer for rankings and streaks
import {
  Leaderboard,
  CategoryLeaderboard,
  MarketCategory,
  StreakType,
} from '@prisma/client';
import { BaseRepository, toRepositoryError } from './base.repository.js';
import { Decimal } from '@prisma/client/runtime/library';

export class LeaderboardRepository extends BaseRepository<Leaderboard> {
  getModelName(): string {
    return 'leaderboard';
  }

  async updateUserStats(userId: string, pnl: number, isWin: boolean) {
    try {
      const leaderboard = await this.prisma.leaderboard.findUnique({
        where: { userId },
      });

      if (!leaderboard) {
        return await this.prisma.leaderboard.create({
          data: {
            userId,
            globalRank: 0,
            weeklyRank: 0,
            allTimePnl: pnl,
            weeklyPnl: pnl,
            allTimeWinRate: isWin ? 100 : 0,
            weeklyWinRate: isWin ? 100 : 0,
            predictionCount: 1,
            streakLength: 1,
            streakType: isWin ? StreakType.WIN : StreakType.LOSS,
            lastPredictionAt: new Date(),
          },
        });
      }

      const newAllTimePnl = new Decimal(leaderboard.allTimePnl.toString()).plus(
        pnl
      );
      const newWeeklyPnl = new Decimal(leaderboard.weeklyPnl.toString()).plus(
        pnl
      );
      const newCount = leaderboard.predictionCount + 1;
      const currentIsWin = isWin ? StreakType.WIN : StreakType.LOSS;
      let newStreakType = leaderboard.streakType;
      let newStreakLength = leaderboard.streakLength;

      if (currentIsWin === leaderboard.streakType) {
        newStreakLength += 1;
      } else {
        newStreakType = currentIsWin;
        newStreakLength = 1;
      }

      return await this.prisma.leaderboard.update({
        where: { userId },
        data: {
          allTimePnl: newAllTimePnl,
          weeklyPnl: newWeeklyPnl,
          predictionCount: newCount,
          streakLength: newStreakLength,
          streakType: newStreakType,
          lastPredictionAt: new Date(),
        },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async updateCategoryStats(
    userId: string,
    category: MarketCategory,
    pnl: number,
    isWin: boolean
  ) {
    try {
      const stats = await this.prisma.categoryLeaderboard.findUnique({
        where: { userId_category: { userId, category } },
      });

      if (!stats) {
        return await this.prisma.categoryLeaderboard.create({
          data: {
            userId,
            category,
            totalPnl: pnl,
            predictionCount: 1,
            winRate: isWin ? 100 : 0,
          },
        });
      }

      return await this.prisma.categoryLeaderboard.update({
        where: { userId_category: { userId, category } },
        data: {
          totalPnl: new Decimal(stats.totalPnl.toString()).plus(pnl),
          predictionCount: stats.predictionCount + 1,
        },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async updateAllRanks() {
    try {
      await this.prisma.$executeRaw`
        WITH Ranked AS (
          SELECT user_id, RANK() OVER (ORDER BY all_time_pnl DESC) as new_rank
          FROM leaderboard
        )
        UPDATE leaderboard
        SET global_rank = Ranked.new_rank
        FROM Ranked
        WHERE leaderboard.user_id = Ranked.user_id
      `;
      await this.prisma.$executeRaw`
        WITH Ranked AS (
          SELECT user_id, RANK() OVER (ORDER BY weekly_pnl DESC) as new_rank
          FROM leaderboard
        )
        UPDATE leaderboard
        SET weekly_rank = Ranked.new_rank
        FROM Ranked
        WHERE leaderboard.user_id = Ranked.user_id
      `;
      await this.prisma.$executeRaw`
        WITH Ranked AS (
          SELECT user_id, category, RANK() OVER (PARTITION BY category ORDER BY total_pnl DESC) as new_rank
          FROM category_leaderboard
        )
        UPDATE category_leaderboard
        SET rank = Ranked.new_rank
        FROM Ranked
        WHERE category_leaderboard.user_id = Ranked.user_id 
        AND category_leaderboard.category = Ranked.category
      `;
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async resetWeeklyStats() {
    try {
      return await this.prisma.leaderboard.updateMany({
        data: { weeklyPnl: 0, weeklyWinRate: 0, weeklyRank: 0 },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async getGlobal(limit: number, offset: number) {
    try {
      return await this.prisma.leaderboard.findMany({
        orderBy: { globalRank: 'asc' },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: { username: true, displayName: true, avatarUrl: true },
          },
        },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async getWeekly(limit: number, offset: number) {
    try {
      return await this.prisma.leaderboard.findMany({
        orderBy: { weeklyRank: 'asc' },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: { username: true, displayName: true, avatarUrl: true },
          },
        },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async getByCategory(category: MarketCategory, limit: number, offset: number) {
    try {
      return await this.prisma.categoryLeaderboard.findMany({
        where: { category },
        orderBy: { rank: 'asc' },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: { username: true, displayName: true, avatarUrl: true },
          },
        },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }
}
