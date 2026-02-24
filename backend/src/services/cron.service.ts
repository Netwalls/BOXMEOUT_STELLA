// Cron service - handles scheduled tasks
import cron from 'node-cron';
import { leaderboardService } from './leaderboard.service.js';
import { logger } from '../utils/logger.js';

export class CronService {
  /**
   * Initializes all scheduled jobs
   */
  async initialize() {
    logger.info('Initializing scheduled jobs');

    // Weekly Ranking Reset: Every Monday at 00:00 UTC
    // Cron pattern: minute hour day-of-month month day-of-week
    cron.schedule('0 0 * * 1', async () => {
      logger.info('Running weekly leaderboard reset job');
      await leaderboardService.resetWeeklyRankings();
    });

    // Rank Recalculation: Every hour
    cron.schedule('0 * * * *', async () => {
      logger.info('Running hourly rank recalculation job');
      await leaderboardService.calculateRanks();
    });

    logger.info('Scheduled jobs initialized successfully');
  }
}

export const cronService = new CronService();
