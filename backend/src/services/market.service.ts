// Market service - business logic for market management
import { MarketRepository } from '../repositories/market.repository.js';
import { PredictionRepository } from '../repositories/prediction.repository.js';
import { MarketCategory, MarketStatus } from '@prisma/client';
import { executeTransaction } from '../database/transaction.js';
import { logger } from '../utils/logger.js';
import { factoryService } from './blockchain/factory.js';
import { ammService } from './blockchain/amm.js';
import { UserService } from './user.service.js';
import {
  leaderboardService,
  LeaderboardService,
} from './leaderboard.service.js';

export class MarketService {
  private marketRepository: MarketRepository;
  private predictionRepository: PredictionRepository;
  private userService: UserService;
  private leaderboardService: LeaderboardService;

  constructor(
    marketRepo?: MarketRepository,
    predictionRepo?: PredictionRepository,
    userSvc?: UserService,
    leaderboardSvc?: LeaderboardService
  ) {
    this.marketRepository = marketRepo || new MarketRepository();
    this.predictionRepository = predictionRepo || new PredictionRepository();
    this.userService = userSvc || new UserService();
    this.leaderboardService = leaderboardSvc || leaderboardService;
  }

  async createPool(marketId: string, initialLiquidity: bigint) {
    // Validate market exists and is OPEN
    const market = await this.marketRepository.findById(marketId);
    if (!market) throw new Error('Market not found');
    if (market.status !== MarketStatus.OPEN)
      throw new Error('Market is not open');

    // If pool already initialized in DB by checking yesLiquidity/noLiquidity > 0
    if (
      Number(market.yesLiquidity || 0) > 0 ||
      Number(market.noLiquidity || 0) > 0
    ) {
      throw new Error('duplicate pool');
    }

    // Call blockchain AMM to create pool
    const chain = await ammService.createPool({
      marketId: market.contractAddress,
      initialLiquidity,
    });

    // Persist pool data and tx hash
    await this.marketRepository.updateLiquidity(
      marketId,
      Number(chain.reserves.yes) / 1_000_000,
      Number(chain.reserves.no) / 1_000_000
    );
    await this.marketRepository.setPoolTxHash(marketId, chain.txHash);

    return {
      marketId,
      txHash: chain.txHash,
      reserves: {
        yes: Number(chain.reserves.yes) / 1_000_000,
        no: Number(chain.reserves.no) / 1_000_000,
      },
      odds: chain.odds,
    };
  }

  async createMarket(data: {
    title: string;
    description: string;
    category: MarketCategory;
    creatorId: string;
    creatorPublicKey: string;
    outcomeA: string;
    outcomeB: string;
    closingAt: Date;
    resolutionTime?: Date;
  }) {
    // Validate closing time is in the future
    if (data.closingAt <= new Date()) {
      throw new Error('Closing time must be in the future');
    }

    // Validate title length
    if (data.title.length < 5 || data.title.length > 200) {
      throw new Error('Title must be between 5 and 200 characters');
    }

    // Validate description length
    if (data.description.length < 10 || data.description.length > 5000) {
      throw new Error('Description must be between 10 and 5000 characters');
    }

    // Default resolution time to 24 hours after closing if not provided
    const resolutionTime =
      data.resolutionTime ||
      new Date(data.closingAt.getTime() + 24 * 60 * 60 * 1000);

    // Validate resolution time is after closing time
    if (resolutionTime <= data.closingAt) {
      throw new Error('Resolution time must be after closing time');
    }

    try {
      // Call blockchain factory to create market on-chain
      const blockchainResult = await factoryService.createMarket({
        title: data.title,
        description: data.description,
        category: data.category,
        closingTime: data.closingAt,
        resolutionTime: resolutionTime,
        creator: data.creatorPublicKey,
      });

      // Store market in database with transaction hash
      const market = await this.marketRepository.createMarket({
        contractAddress: blockchainResult.marketId,
        title: data.title,
        description: data.description,
        category: data.category,
        creatorId: data.creatorId,
        outcomeA: data.outcomeA,
        outcomeB: data.outcomeB,
        closingAt: data.closingAt,
      });

      return {
        ...market,
        txHash: blockchainResult.txHash,
        blockchainMarketId: blockchainResult.marketId,
      };
    } catch (error) {
      logger.error('Market creation error', { error });
      throw new Error(
        `Failed to create market: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async getMarketDetails(marketId: string) {
    const market = await this.marketRepository.findById(marketId);
    if (!market) {
      throw new Error('Market not found');
    }

    // Get prediction statistics
    const predictionStats =
      await this.predictionRepository.getMarketPredictionStats(marketId);

    return {
      ...market,
      predictionStats,
    };
  }

  async listMarkets(options?: {
    category?: MarketCategory;
    status?: MarketStatus;
    skip?: number;
    take?: number;
  }) {
    if (options?.status === MarketStatus.OPEN) {
      return await this.marketRepository.findActiveMarkets({
        category: options.category,
        skip: options.skip,
        take: options.take,
      });
    }

    return await this.marketRepository.findMany({
      where: {
        ...(options?.category && { category: options.category }),
        ...(options?.status && { status: options.status }),
      },
      orderBy: { createdAt: 'desc' },
      skip: options?.skip,
      take: options?.take || 20,
    });
  }

  async closeMarket(marketId: string) {
    const market = await this.marketRepository.findById(marketId);
    if (!market) {
      throw new Error('Market not found');
    }

    if (market.status !== MarketStatus.OPEN) {
      throw new Error('Market is not open');
    }

    return await this.marketRepository.updateMarketStatus(
      marketId,
      MarketStatus.CLOSED,
      { closedAt: new Date() }
    );
  }

  async resolveMarket(
    marketId: string,
    winningOutcome: number,
    resolutionSource: string
  ) {
    const market = await this.marketRepository.findById(marketId);
    if (!market) {
      throw new Error('Market not found');
    }

    if (
      market.status !== MarketStatus.CLOSED &&
      market.status !== MarketStatus.OPEN
    ) {
      throw new Error(`Market cannot be resolved in ${market.status} status`);
    }

    if (market.status === MarketStatus.OPEN && market.closingAt > new Date()) {
      throw new Error('Market is still open and has not reached closing time');
    }

    if (winningOutcome !== 0 && winningOutcome !== 1) {
      throw new Error('Winning outcome must be 0 or 1');
    }

    // Update market status
    const resolvedMarket = await this.marketRepository.updateMarketStatus(
      marketId,
      MarketStatus.RESOLVED,
      {
        resolvedAt: new Date(),
        winningOutcome,
        resolutionSource,
      }
    );

    // Settle all predictions
    await this.settlePredictions(marketId, winningOutcome);

    return resolvedMarket;
  }

  async markWinningsClaimed(marketId: string, userId: string) {
    const prediction = await this.predictionRepository.findByUserAndMarket(
      userId,
      marketId
    );
    if (!prediction) {
      throw new Error('Prediction not found');
    }

    if (!prediction.isWinner) {
      throw new Error('User did not win this market');
    }

    return await this.predictionRepository.claimWinnings(prediction.id);
  }

  async addAttestation(
    marketId: string,
    oracleId: string,
    outcome: number,
    txHash: string
  ) {
    return await this.marketRepository.addAttestation(
      marketId,
      oracleId,
      outcome,
      txHash
    );
  }

  async hasAttested(marketId: string, oracleId: string): Promise<boolean> {
    return await this.marketRepository.hasAttested(marketId, oracleId);
  }

  private async settlePredictions(marketId: string, winningOutcome: number) {
    const market = await this.marketRepository.findById(marketId);
    if (!market) throw new Error('Market not found');

    const predictions =
      await this.predictionRepository.findMarketPredictions(marketId);

    await executeTransaction(async (tx) => {
      const predictionRepo = new PredictionRepository(tx);

      for (const prediction of predictions) {
        const isWinner = prediction.predictedOutcome === winningOutcome;

        // Calculate PnL (simplified - actual calculation would involve odds)
        const pnlUsd = isWinner
          ? Number(prediction.amountUsdc) * 0.9 // 90% return (10% fee)
          : -Number(prediction.amountUsdc);

        await predictionRepo.settlePrediction(prediction.id, isWinner, pnlUsd);
      }
    });

    // Evaluate tier promotion for all participants after settlement
    const userIds = [...new Set(predictions.map((p) => p.userId))];
    logger.info('Evaluating tier updates after market resolution', {
      marketId,
      userCount: userIds.length,
    });

    for (const userId of userIds) {
      try {
        await this.userService.calculateAndUpdateTier(userId);

        // Find predictions for this specific user to calculate their total PNL for this market
        const userPredictions = predictions.filter((p) => p.userId === userId);
        let totalUserPnl = 0;
        let hasWin = false;

        for (const p of userPredictions) {
          const isWinner = p.predictedOutcome === winningOutcome;
          if (isWinner) hasWin = true;

          const pnlUsd = isWinner
            ? Number(p.amountUsdc) * 0.9
            : -Number(p.amountUsdc);
          totalUserPnl += pnlUsd;
        }

        await this.leaderboardService.handleSettlement(
          userId,
          marketId,
          market.category,
          totalUserPnl,
          hasWin
        );
      } catch (error) {
        logger.error('Failed to update tier or leaderboard for user', {
          userId,
          error,
        });
      }
    }

    // Recalculate all rankings after settlement
    await this.leaderboardService.calculateRanks();
  }

  async cancelMarket(marketId: string, creatorId: string) {
    const market = await this.marketRepository.findById(marketId);
    if (!market) {
      throw new Error('Market not found');
    }

    if (market.creatorId !== creatorId) {
      throw new Error('Only market creator can cancel');
    }

    if (market.status === MarketStatus.RESOLVED) {
      throw new Error('Cannot cancel resolved market');
    }

    return await this.marketRepository.updateMarketStatus(
      marketId,
      MarketStatus.CANCELLED
    );
  }

  async deactivateMarket(marketId: string) {
    const market = await this.marketRepository.findById(marketId);
    if (!market) {
      throw new Error('Market not found');
    }

    // Call blockchain factory to deactivate market on-chain
    await factoryService.deactivateMarket(market.contractAddress);

    // Update market status in the database to CANCELLED
    return await this.marketRepository.updateMarketStatus(
      marketId,
      MarketStatus.CANCELLED
    );
  }

  async getTrendingMarkets(limit: number = 10) {
    return await this.marketRepository.getTrendingMarkets(limit);
  }

  async getMarketsByCategory(
    category: MarketCategory,
    skip?: number,
    take?: number
  ) {
    return await this.marketRepository.getMarketsByCategory(
      category,
      skip,
      take
    );
  }

  async getMarketsByCreator(creatorId: string) {
    return await this.marketRepository.findMarketsByCreator(creatorId);
  }

  async updateMarketVolume(marketId: string, volumeChange: number) {
    return await this.marketRepository.updateMarketVolume(
      marketId,
      volumeChange
    );
  }

  async getMarketStatistics() {
    return await this.marketRepository.getMarketStatistics();
  }

  async getClosingMarkets(withinHours: number = 24) {
    return await this.marketRepository.getClosingMarkets(withinHours);
  }
}
