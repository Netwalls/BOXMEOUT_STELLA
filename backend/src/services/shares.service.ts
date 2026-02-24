// backend/src/services/shares.service.ts
// Shares service - manages portfolio positions and unrealized PnL

import { shareRepository, ShareRepository } from '../repositories/share.repository.js';
import { MarketRepository } from '../repositories/market.repository.js';
import { ammService } from './blockchain/amm.js';
import { ApiError } from '../middleware/error.middleware.js';
import { MarketStatus } from '@prisma/client';
import { logger } from '../utils/logger.js';

interface PositionWithMarket {
  id: string;
  marketId: string;
  marketTitle: string;
  marketStatus: MarketStatus;
  outcome: number;
  outcomeName: string;
  quantity: number;
  costBasis: number;
  entryPrice: number;
  currentPrice: number;
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercentage: number;
  acquiredAt: Date;
}

interface PortfolioSummary {
  totalPositions: number;
  totalCostBasis: number;
  totalCurrentValue: number;
  totalUnrealizedPnl: number;
  totalUnrealizedPnlPercentage: number;
  positions: PositionWithMarket[];
}

export class SharesService {
  private shareRepository: ShareRepository;
  private marketRepository: MarketRepository;

  constructor(
    shareRepo?: ShareRepository,
    marketRepo?: MarketRepository
  ) {
    this.shareRepository = shareRepo || shareRepository;
    this.marketRepository = marketRepo || new MarketRepository();
  }

  /**
   * Get current spot price for a market outcome from AMM
   */
  private async getCurrentPrice(
    marketId: string,
    outcome: number
  ): Promise<number> {
    try {
      const odds = await ammService.getOdds(marketId);
      return outcome === 1 ? odds.yesOdds : odds.noOdds;
    } catch (error) {
      logger.warn('Failed to fetch current price from AMM', {
        marketId,
        outcome,
        error,
      });
      // Return 0 if AMM is unavailable
      return 0;
    }
  }

  /**
   * Update current value and unrealized PnL for a single position
   */
  async updatePositionValue(shareId: string): Promise<void> {
    // This method is currently not used but kept for potential future use
    // For now, position updates happen during getUserPositions()
    // If needed in the future, implement direct share lookup by ID
    logger.warn('updatePositionValue called but not implemented', { shareId });
  }

  /**
   * Get all active positions for a user with current values
   */
  async getUserPositions(userId: string): Promise<PositionWithMarket[]> {
    const shares = await this.shareRepository.findActivePositionsByUser(userId);

    const positions: PositionWithMarket[] = [];

    for (const share of shares) {
      const market = share.market;
      
      let currentPrice = Number(share.entryPrice);
      
      // Fetch current price from AMM for OPEN markets
      if (market.status === MarketStatus.OPEN) {
        try {
          currentPrice = await this.getCurrentPrice(
            market.contractAddress,
            share.outcome
          );
        } catch (error) {
          logger.warn('Failed to fetch current price, using entry price', {
            shareId: share.id,
            marketId: market.id,
          });
        }
      }

      const quantity = Number(share.quantity);
      const costBasis = Number(share.costBasis);
      const currentValue = quantity * currentPrice;
      const unrealizedPnl = currentValue - costBasis;
      const unrealizedPnlPercentage =
        costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;

      // Update position in database with latest values
      if (market.status === MarketStatus.OPEN && currentPrice > 0) {
        await this.shareRepository.updatePosition(share.id, {
          currentValue,
          unrealizedPnl,
        });
      }

      positions.push({
        id: share.id,
        marketId: market.id,
        marketTitle: market.title,
        marketStatus: market.status,
        outcome: share.outcome,
        outcomeName: share.outcome === 1 ? market.outcomeB : market.outcomeA,
        quantity,
        costBasis,
        entryPrice: Number(share.entryPrice),
        currentPrice,
        currentValue,
        unrealizedPnl,
        unrealizedPnlPercentage,
        acquiredAt: share.acquiredAt,
      });
    }

    return positions;
  }

  /**
   * Get portfolio summary with aggregated metrics
   */
  async getPortfolioSummary(userId: string): Promise<PortfolioSummary> {
    const positions = await this.getUserPositions(userId);

    const totalCostBasis = positions.reduce(
      (sum, pos) => sum + pos.costBasis,
      0
    );
    const totalCurrentValue = positions.reduce(
      (sum, pos) => sum + pos.currentValue,
      0
    );
    const totalUnrealizedPnl = totalCurrentValue - totalCostBasis;
    const totalUnrealizedPnlPercentage =
      totalCostBasis > 0 ? (totalUnrealizedPnl / totalCostBasis) * 100 : 0;

    return {
      totalPositions: positions.length,
      totalCostBasis,
      totalCurrentValue,
      totalUnrealizedPnl,
      totalUnrealizedPnlPercentage,
      positions,
    };
  }

  /**
   * Get positions for a specific market
   */
  async getMarketPositions(
    userId: string,
    marketId: string
  ): Promise<PositionWithMarket[]> {
    const shares = await this.shareRepository.findByUserAndMarket(
      userId,
      marketId
    );

    const positions: PositionWithMarket[] = [];

    for (const share of shares) {
      if (Number(share.quantity) === 0) {
        continue; // Skip closed positions
      }

      const market = share.market;
      
      let currentPrice = Number(share.entryPrice);
      
      if (market.status === MarketStatus.OPEN) {
        try {
          currentPrice = await this.getCurrentPrice(
            market.contractAddress,
            share.outcome
          );
        } catch (error) {
          logger.warn('Failed to fetch current price', {
            shareId: share.id,
            marketId: market.id,
          });
        }
      }

      const quantity = Number(share.quantity);
      const costBasis = Number(share.costBasis);
      const currentValue = quantity * currentPrice;
      const unrealizedPnl = currentValue - costBasis;
      const unrealizedPnlPercentage =
        costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;

      positions.push({
        id: share.id,
        marketId: market.id,
        marketTitle: market.title,
        marketStatus: market.status,
        outcome: share.outcome,
        outcomeName: share.outcome === 1 ? market.outcomeB : market.outcomeA,
        quantity,
        costBasis,
        entryPrice: Number(share.entryPrice),
        currentPrice,
        currentValue,
        unrealizedPnl,
        unrealizedPnlPercentage,
        acquiredAt: share.acquiredAt,
      });
    }

    return positions;
  }

  /**
   * Bulk update all positions for a user
   */
  async refreshAllPositions(userId: string): Promise<void> {
    const shares = await this.shareRepository.findActivePositionsByUser(userId);

    for (const share of shares) {
      try {
        const market = await this.marketRepository.findById(share.marketId);
        if (!market || market.status !== MarketStatus.OPEN) {
          continue;
        }

        const currentPrice = await this.getCurrentPrice(
          market.contractAddress,
          share.outcome
        );

        if (currentPrice === 0) {
          continue;
        }

        const quantity = Number(share.quantity);
        const costBasis = Number(share.costBasis);
        const currentValue = quantity * currentPrice;
        const unrealizedPnl = currentValue - costBasis;

        await this.shareRepository.updatePosition(share.id, {
          currentValue,
          unrealizedPnl,
        });
      } catch (error) {
        logger.error('Failed to update position value', {
          shareId: share.id,
          userId,
          error,
        });
      }
    }
  }
}

export const sharesService = new SharesService();
