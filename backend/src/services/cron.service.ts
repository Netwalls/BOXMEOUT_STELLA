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

  constructor(marketRepo?: MarketRepository, marketSvc?: MarketService) {
    this.marketRepository = marketRepo || new MarketRepository();
    this.marketService = marketSvc || new MarketService();
  }

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

    // Oracle Consensus Polling: Every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      await this.pollOracleConsensus();
    });

    logger.info('Scheduled jobs initialized successfully');
  }

  /**
   * Polls oracle contract for all CLOSED markets and resolves any that have reached consensus.
   */
  async pollOracleConsensus() {
    logger.info('Running oracle consensus polling job');

    let markets;
    try {
      markets =
        await this.marketRepository.getClosedMarketsAwaitingResolution();
    } catch (error) {
      logger.error('Oracle polling: failed to fetch closed markets', { error });
      return;
    }

    if (markets.length === 0) {
      logger.info('Oracle polling: no CLOSED markets awaiting resolution');
      return;
    }

    logger.info(
      `Oracle polling: checking consensus for ${markets.length} market(s)`
    );

    for (const market of markets) {
      try {
        const winningOutcome = await oracleService.checkConsensus(market.id);

        if (winningOutcome === null) {
          logger.info(
            `Oracle polling: no consensus yet for market ${market.id}`
          );
          continue;
        }

        logger.info(
          `Oracle polling: consensus reached for market ${market.id}`,
          {
            winningOutcome,
          }
        );

        const resolved = await this.marketService.resolveMarket(
          market.id,
          winningOutcome,
          'oracle-consensus'
        );

        logger.info(
          `Oracle polling: market ${market.id} resolved successfully`,
          {
            winningOutcome,
            resolvedAt: resolved.resolvedAt,
          }
        );
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
