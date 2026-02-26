// Leaderboard Broadcaster Service - Scheduled rank change broadcasting (Issue #116)
import { LeaderboardRepository } from '../repositories/leaderboard.repository.js';
import { logger } from '../utils/logger.js';
import { Server as SocketIOServer } from 'socket.io';

export interface RankSnapshot {
  userId: string;
  globalRank: number;
  weeklyRank: number;
  allTimePnl: number;
  weeklyPnl: number;
  timestamp: number;
}

export interface RankChangeEvent {
  type: 'rank_changed';
  userId: string;
  previousGlobalRank: number;
  currentGlobalRank: number;
  previousWeeklyRank: number;
  currentWeeklyRank: number;
  rankChange: number; // positive = improved (lower rank number)
  timestamp: number;
}

export interface LeaderboardUpdateEvent {
  type: 'leaderboard_updated';
  topGlobal: Array<{
    userId: string;
    username: string;
    rank: number;
    pnl: number;
  }>;
  topWeekly: Array<{
    userId: string;
    username: string;
    rank: number;
    pnl: number;
  }>;
  timestamp: number;
}

export interface AchievementNotification {
  type: 'achievement_earned';
  userId: string;
  achievementType: string;
  title: string;
  description: string;
  timestamp: number;
}

export class LeaderboardBroadcasterService {
  private leaderboardRepository: LeaderboardRepository;
  private io: SocketIOServer | null = null;
  private broadcastTimer?: NodeJS.Timeout;
  private lastBroadcastTime: number = 0;
  private previousSnapshots: Map<string, RankSnapshot> = new Map();
  private readonly BROADCAST_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MIN_BROADCAST_GAP_MS = 4 * 60 * 1000; // 4 minutes minimum gap
  private isBroadcasting = false;

  constructor(leaderboardRepository?: LeaderboardRepository) {
    this.leaderboardRepository =
      leaderboardRepository || new LeaderboardRepository();
  }

  /**
   * Initialize the broadcaster with Socket.IO instance
   */
  initialize(io: SocketIOServer): void {
    this.io = io;
    logger.info('Leaderboard broadcaster initialized');
  }

  /**
   * Start scheduled broadcasting every 5 minutes
   */
  start(): void {
    if (this.broadcastTimer) {
      logger.warn('Leaderboard broadcaster already running');
      return;
    }

    logger.info('Starting leaderboard broadcaster', {
      intervalMs: this.BROADCAST_INTERVAL_MS,
    });

    // Run immediately on start
    void this.broadcastRankChanges();

    // Then schedule every 5 minutes
    this.broadcastTimer = setInterval(() => {
      void this.broadcastRankChanges();
    }, this.BROADCAST_INTERVAL_MS);
  }

  /**
   * Stop scheduled broadcasting
   */
  stop(): void {
    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = undefined;
      logger.info('Leaderboard broadcaster stopped');
    }
  }

  /**
   * Main broadcast function - idempotent and resilient
   */
  async broadcastRankChanges(): Promise<void> {
    // Idempotency check - prevent duplicate broadcasts within interval
    const now = Date.now();
    const timeSinceLastBroadcast = now - this.lastBroadcastTime;

    if (timeSinceLastBroadcast < this.MIN_BROADCAST_GAP_MS) {
      logger.debug('Skipping broadcast - too soon since last broadcast', {
        timeSinceLastMs: timeSinceLastBroadcast,
        minGapMs: this.MIN_BROADCAST_GAP_MS,
      });
      return;
    }

    // Prevent concurrent broadcasts
    if (this.isBroadcasting) {
      logger.debug('Skipping broadcast - already in progress');
      return;
    }

    this.isBroadcasting = true;

    try {
      logger.info('Starting leaderboard rank change broadcast');

      // Step 1: Recalculate ranks (deterministic, stable sort)
      await this.leaderboardRepository.updateAllRanks();

      // Step 2: Get current snapshot
      const currentSnapshot = await this.getCurrentSnapshot();

      // Step 3: Detect rank changes
      const rankChanges = this.detectRankChanges(currentSnapshot);

      // Step 4: Broadcast rank change events (private, per-user)
      await this.broadcastPrivateRankChanges(rankChanges);

      // Step 5: Broadcast public leaderboard update (aggregated, no sensitive data)
      await this.broadcastPublicLeaderboardUpdate();

      // Step 6: Check and broadcast achievements (private, per-user)
      await this.broadcastAchievements(rankChanges);

      // Step 7: Update snapshot for next comparison
      this.previousSnapshots = currentSnapshot;
      this.lastBroadcastTime = now;

      logger.info('Leaderboard broadcast completed successfully', {
        rankChangesDetected: rankChanges.length,
        timestamp: now,
      });
    } catch (error) {
      logger.error('Leaderboard broadcast failed', { error });
    } finally {
      this.isBroadcasting = false;
    }
  }

  /**
   * Get current leaderboard snapshot
   */
  private async getCurrentSnapshot(): Promise<Map<string, RankSnapshot>> {
    const leaderboards = await this.leaderboardRepository.findMany({
      select: {
        userId: true,
        globalRank: true,
        weeklyRank: true,
        allTimePnl: true,
        weeklyPnl: true,
      },
    });

    const snapshot = new Map<string, RankSnapshot>();
    const timestamp = Date.now();

    for (const lb of leaderboards) {
      snapshot.set(lb.userId, {
        userId: lb.userId,
        globalRank: lb.globalRank,
        weeklyRank: lb.weeklyRank,
        allTimePnl: Number(lb.allTimePnl),
        weeklyPnl: Number(lb.weeklyPnl),
        timestamp,
      });
    }

    return snapshot;
  }

  /**
   * Detect rank changes using deterministic comparison
   */
  private detectRankChanges(
    currentSnapshot: Map<string, RankSnapshot>
  ): RankChangeEvent[] {
    const changes: RankChangeEvent[] = [];

    for (const [userId, current] of currentSnapshot.entries()) {
      const previous = this.previousSnapshots.get(userId);

      // Skip if no previous data (first run or new user)
      if (!previous) {
        continue;
      }

      // Check if rank changed (deterministic comparison)
      const globalRankChanged = current.globalRank !== previous.globalRank;
      const weeklyRankChanged = current.weeklyRank !== previous.weeklyRank;

      if (globalRankChanged || weeklyRankChanged) {
        // Calculate rank change (positive = improved, negative = worsened)
        const rankChange = previous.globalRank - current.globalRank;

        changes.push({
          type: 'rank_changed',
          userId,
          previousGlobalRank: previous.globalRank,
          currentGlobalRank: current.globalRank,
          previousWeeklyRank: previous.weeklyRank,
          currentWeeklyRank: current.weeklyRank,
          rankChange,
          timestamp: current.timestamp,
        });
      }
    }

    // Stable sort by rank change magnitude (deterministic)
    changes.sort((a, b) => Math.abs(b.rankChange) - Math.abs(a.rankChange));

    return changes;
  }

  /**
   * Broadcast private rank change notifications to individual users
   * Ensures proper authorization and prevents data leakage
   */
  private async broadcastPrivateRankChanges(
    changes: RankChangeEvent[]
  ): Promise<void> {
    if (!this.io) {
      logger.warn('Socket.IO not initialized, skipping private broadcasts');
      return;
    }

    for (const change of changes) {
      try {
        // Emit to user's private room (secure channel)
        // Socket.IO rooms are automatically created per user on connection
        this.io.to(`user:${change.userId}`).emit('rank_changed', {
          type: 'rank_changed',
          previousGlobalRank: change.previousGlobalRank,
          currentGlobalRank: change.currentGlobalRank,
          previousWeeklyRank: change.previousWeeklyRank,
          currentWeeklyRank: change.currentWeeklyRank,
          rankChange: change.rankChange,
          improved: change.rankChange > 0,
          timestamp: change.timestamp,
        });

        logger.debug('Private rank change notification sent', {
          userId: change.userId,
          rankChange: change.rankChange,
        });
      } catch (error) {
        logger.error('Failed to send private rank change notification', {
          userId: change.userId,
          error,
        });
      }
    }
  }

  /**
   * Broadcast public leaderboard update (aggregated, no sensitive data)
   */
  private async broadcastPublicLeaderboardUpdate(): Promise<void> {
    if (!this.io) {
      logger.warn('Socket.IO not initialized, skipping public broadcast');
      return;
    }

    try {
      // Get top 10 global and weekly (public data only)
      const topGlobal = await this.leaderboardRepository.getGlobal(10, 0);
      const topWeekly = await this.leaderboardRepository.getWeekly(10, 0);

      const event: LeaderboardUpdateEvent = {
        type: 'leaderboard_updated',
        topGlobal: topGlobal.map((lb) => ({
          userId: lb.userId,
          username: lb.user.username,
          rank: lb.globalRank,
          pnl: Number(lb.allTimePnl),
        })),
        topWeekly: topWeekly.map((lb) => ({
          userId: lb.userId,
          username: lb.user.username,
          rank: lb.weeklyRank,
          pnl: Number(lb.weeklyPnl),
        })),
        timestamp: Date.now(),
      };

      // Broadcast to all connected clients in leaderboard room
      this.io.to('leaderboard:global').emit('leaderboard_updated', event);

      logger.info('Public leaderboard update broadcast', {
        topGlobalCount: event.topGlobal.length,
        topWeeklyCount: event.topWeekly.length,
      });
    } catch (error) {
      logger.error('Failed to broadcast public leaderboard update', { error });
    }
  }

  /**
   * Broadcast private achievement notifications
   * Only delivered to relevant user through secure channel
   */
  private async broadcastAchievements(
    changes: RankChangeEvent[]
  ): Promise<void> {
    if (!this.io) {
      return;
    }

    for (const change of changes) {
      try {
        const achievements = this.detectAchievements(change);

        for (const achievement of achievements) {
          // Emit to user's private room only
          this.io.to(`user:${change.userId}`).emit('achievement_earned', {
            type: 'achievement_earned',
            achievementType: achievement.type,
            title: achievement.title,
            description: achievement.description,
            timestamp: Date.now(),
          });

          logger.info('Achievement notification sent', {
            userId: change.userId,
            achievementType: achievement.type,
          });
        }
      } catch (error) {
        logger.error('Failed to broadcast achievement', {
          userId: change.userId,
          error,
        });
      }
    }
  }

  /**
   * Detect achievements based on rank changes
   */
  private detectAchievements(change: RankChangeEvent): Array<{
    type: string;
    title: string;
    description: string;
  }> {
    const achievements: Array<{
      type: string;
      title: string;
      description: string;
    }> = [];

    // Top 10 Global Achievement
    if (
      change.currentGlobalRank <= 10 &&
      change.previousGlobalRank > 10
    ) {
      achievements.push({
        type: 'top_10_global',
        title: 'Top 10 Predictor!',
        description: `You've reached rank #${change.currentGlobalRank} on the global leaderboard!`,
      });
    }

    // Top 100 Global Achievement
    if (
      change.currentGlobalRank <= 100 &&
      change.previousGlobalRank > 100
    ) {
      achievements.push({
        type: 'top_100_global',
        title: 'Top 100 Predictor!',
        description: `You've entered the top 100 at rank #${change.currentGlobalRank}!`,
      });
    }

    // Big Climb Achievement (improved by 50+ ranks)
    if (change.rankChange >= 50) {
      achievements.push({
        type: 'big_climb',
        title: 'Rising Star!',
        description: `You've climbed ${change.rankChange} ranks! Keep it up!`,
      });
    }

    // Weekly Leader Achievement
    if (
      change.currentWeeklyRank === 1 &&
      change.previousWeeklyRank !== 1
    ) {
      achievements.push({
        type: 'weekly_leader',
        title: 'Weekly Champion!',
        description: "You're #1 on the weekly leaderboard!",
      });
    }

    return achievements;
  }

  /**
   * Get current broadcast status (for monitoring)
   */
  getStatus(): {
    isRunning: boolean;
    isBroadcasting: boolean;
    lastBroadcastTime: number;
    snapshotSize: number;
  } {
    return {
      isRunning: !!this.broadcastTimer,
      isBroadcasting: this.isBroadcasting,
      lastBroadcastTime: this.lastBroadcastTime,
      snapshotSize: this.previousSnapshots.size,
    };
  }
}

export const leaderboardBroadcasterService =
  new LeaderboardBroadcasterService();
