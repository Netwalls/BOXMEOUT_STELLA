// Cron service - handles scheduled tasks
import cron from 'node-cron';
import { leaderboardService } from './leaderboard.service.js';
import { MarketService } from './market.service.js';
import { oracleService } from './blockchain/oracle.js';
import { MarketRepository } from '../repositories/index.js';
import { logger } from '../utils/logger.js';

export class CronService {
  private marketRepository: MarketRepository;
  private marketService: MarketService;

  constructor(
    marketRepo?: MarketRepository,
    marketSvc?: MarketService
  ) {
    this.marketRepository = marketRepo || new MarketRepository();
    this.marketService = marketSvc || new MarketService();
  }

  /**
   * Initializes all scheduled jobs
   */
  async initialize() {
    logger.info('Initializing scheduled jobs');

    // Market Auto-Close: Every 1 minute
    cron.schedule('* * * * *', async () => {
      await this.autoCloseMarkets();
    });

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

    // Oracle Consensus Polling: Every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      await this.pollOracleConsensus();
    });

    logger.info('Scheduled jobs initialized successfully');
  }

  /**
   * Auto-closes markets that have passed their closing time.
   * Runs every 1 minute.
   */
  async autoCloseMarkets() {
    logger.info('Running market auto-close job');

    let markets;
    try {
      markets = await this.marketRepository.getMarketsPastClosingTime();
    } catch (error) {
      logger.error('Market auto-close: failed to fetch markets past closing time', { error });
      return;
    }

    if (markets.length === 0) {
      logger.info('Market auto-close: no markets to close');
      return;
    }

    logger.info(`Market auto-close: found ${markets.length} market(s) to close`);

    let successCount = 0;
    let failureCount = 0;

    for (const market of markets) {
      try {
        await this.marketService.closeMarket(market.id);
        successCount++;
        logger.info(`Market auto-close: successfully closed market ${market.id}`, {
          marketId: market.id,
          title: market.title,
          closingAt: market.closingAt,
        });
      } catch (error) {
        failureCount++;
        logger.error(`Market auto-close: failed to close market ${market.id}`, {
          error,
          marketId: market.id,
          title: market.title,
          closingAt: market.closingAt,
        });
        // Continue processing remaining markets
      }
    }

    logger.info('Market auto-close: job completed', {
      total: markets.length,
      success: successCount,
      failures: failureCount,
    });

    // Alert on failures if any
    if (failureCount > 0) {
      logger.warn(`Market auto-close: ${failureCount} market(s) failed to close`, {
        failureCount,
        totalAttempted: markets.length,
      });
    }
  }

  /**
   * Polls oracle contract for all CLOSED markets and resolves any that have reached consensus.
   */
  async pollOracleConsensus() {
    logger.info('Running oracle consensus polling job');

    let markets;
    try {
      markets = await this.marketRepository.getClosedMarketsAwaitingResolution();
    } catch (error) {
      logger.error('Oracle polling: failed to fetch closed markets', { error });
      return;
    }

    if (markets.length === 0) {
      logger.info('Oracle polling: no CLOSED markets awaiting resolution');
      return;
    }

    logger.info(`Oracle polling: checking consensus for ${markets.length} market(s)`);

    for (const market of markets) {
      try {
        const winningOutcome = await oracleService.checkConsensus(market.id);

        if (winningOutcome === null) {
          logger.info(`Oracle polling: no consensus yet for market ${market.id}`);
          continue;
        }

        logger.info(`Oracle polling: consensus reached for market ${market.id}`, {
          winningOutcome,
        });

        const resolved = await this.marketService.resolveMarket(
          market.id,
          winningOutcome,
          'oracle-consensus'
        );

        logger.info(`Oracle polling: market ${market.id} resolved successfully`, {
          winningOutcome,
          resolvedAt: resolved.resolvedAt,
        });
      } catch (error) {
        logger.error(`Oracle polling: failed to process market ${market.id}`, {
          error,
          marketId: market.id,
        });
        // Continue processing remaining markets
      }
    }
  }
}

export const cronService = new CronService();
