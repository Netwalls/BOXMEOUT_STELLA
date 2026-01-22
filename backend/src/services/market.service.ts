// Market service - business logic for market management
import { MarketRepository } from '../repositories/market.repository.js';
import { PredictionRepository } from '../repositories/prediction.repository.js';
import { MarketCategory, MarketStatus } from '@prisma/client';
import { executeTransaction } from '../database/transaction.js';

export class MarketService {
  private marketRepository: MarketRepository;
  private predictionRepository: PredictionRepository;

  constructor() {
    this.marketRepository = new MarketRepository();
    this.predictionRepository = new PredictionRepository();
  }

  async createMarket(data: {
    contractAddress: string;
    title: string;
    description: string;
    category: MarketCategory;
    creatorId: string;
    outcomeA: string;
    outcomeB: string;
    closingAt: Date;
  }) {
    // Validate closing time is in the future
    if (data.closingAt <= new Date()) {
      throw new Error('Closing time must be in the future');
    }

    // Validate title length
    if (data.title.length < 5 || data.title.length > 200) {
      throw new Error('Title must be between 5 and 200 characters');
    }

    // Check contract address uniqueness
    const existing = await this.marketRepository.findByContractAddress(
      data.contractAddress
    );
    if (existing) {
      throw new Error('Contract address already exists');
    }

    return await this.marketRepository.createMarket(data);
  }

  async getMarketDetails(marketId: string) {
    const market = await this.marketRepository.findById(marketId);
    if (!market) {
      throw new Error('Market not found');
    }

    // Get prediction statistics
    const predictionStats = await this.predictionRepository.getMarketPredictionStats(
      marketId
    );

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

  async resolveMarket(marketId: string, winningOutcome: number, resolutionSource: string) {
    const market = await this.marketRepository.findById(marketId);
    if (!market) {
      throw new Error('Market not found');
    }

    if (market.status !== MarketStatus.CLOSED) {
      throw new Error('Market must be closed before resolution');
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

  private async settlePredictions(marketId: string, winningOutcome: number) {
    const predictions = await this.predictionRepository.findMarketPredictions(marketId);

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

  async getTrendingMarkets(limit: number = 10) {
    return await this.marketRepository.getTrendingMarkets(limit);
  }

  async getMarketsByCategory(
    category: MarketCategory,
    skip?: number,
    take?: number
  ) {
    return await this.marketRepository.getMarketsByCategory(category, skip, take);
  }

  async getMarketsByCreator(creatorId: string) {
    return await this.marketRepository.findMarketsByCreator(creatorId);
  }

  async updateMarketVolume(marketId: string, volumeChange: number) {
    return await this.marketRepository.updateMarketVolume(marketId, volumeChange);
  }

  async getMarketStatistics() {
    return await this.marketRepository.getMarketStatistics();
  }

  async getClosingMarkets(withinHours: number = 24) {
    return await this.marketRepository.getClosingMarkets(withinHours);
  }
}
