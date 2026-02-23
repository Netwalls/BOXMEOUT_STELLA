// Shares service - business logic for portfolio position management
import { SharesRepository } from '../repositories/shares.repository.js';
import { MarketRepository } from '../repositories/market.repository.js';
import { ammService } from './blockchain/amm.js';
import { logger } from '../utils/logger.js';
import { MarketStatus } from '@prisma/client';

export class SharesService {
  private sharesRepository: SharesRepository;
  private marketRepository: MarketRepository;

  constructor() {
    this.sharesRepository = new SharesRepository();
    this.marketRepository = new MarketRepository();
  }

  /**
   * Get all positions for a user with current values
   */
  async getUserPositions(
    userId: string,
    options?: {
      marketId?: string;
      skip?: number;
      take?: number;
    }
  ) {
    const shares = await this.sharesRepository.findUserShares(userId, {
      ...options,
      includeMarket: true,
    });

    // Update current values based on AMM spot prices
    const updatedShares = await Promise.all(
      shares.map(async (share) => {
        try {
          const { currentValue, unrealizedPnl } =
            await this.calculateCurrentValue(share);

          // Update in database
          await this.sharesRepository.updateShareValue(
            share.id,
            currentValue,
            unrealizedPnl
          );

          return {
            ...share,
            currentValue,
            unrealizedPnl,
          };
        } catch (error) {
          logger.warn(
            `Failed to update share value for share ${share.id}`,
            error
          );
          return share;
        }
      })
    );

    return updatedShares;
  }

  /**
   * Get a specific position
   */
  async getPosition(userId: string, marketId: string, outcome: number) {
    const share = await this.sharesRepository.findUserMarketShare(
      userId,
      marketId,
      outcome
    );

    if (!share) {
      throw new Error('Position not found');
    }

    // Update current value
    const { currentValue, unrealizedPnl } =
      await this.calculateCurrentValue(share);

    await this.sharesRepository.updateShareValue(
      share.id,
      currentValue,
      unrealizedPnl
    );

    return {
      ...share,
      currentValue,
      unrealizedPnl,
    };
  }

  /**
   * Calculate current value based on AMM spot price
   */
  private async calculateCurrentValue(share: any): Promise<{
    currentValue: number;
    unrealizedPnl: number;
  }> {
    const market = share.market || (await this.marketRepository.findById(share.marketId));
    
    if (!market) {
      throw new Error('Market not found');
    }

    // If market is resolved, use final settlement value
    if (market.status === MarketStatus.RESOLVED) {
      const isWinner = share.outcome === market.winningOutcome;
      const currentValue = isWinner ? Number(share.quantity) : 0;
      const unrealizedPnl = currentValue - Number(share.costBasis);
      return { currentValue, unrealizedPnl };
    }

    // If market is cancelled, shares are worthless
    if (market.status === MarketStatus.CANCELLED) {
      return { currentValue: 0, unrealizedPnl: -Number(share.costBasis) };
    }

    // For open/closed markets, get current price from AMM
    try {
      const poolState = await ammService.getPoolState(market.contractAddress);
      const spotPrice =
        share.outcome === 1 ? poolState.odds.yes : poolState.odds.no;

      const currentValue = Number(share.quantity) * spotPrice;
      const unrealizedPnl = currentValue - Number(share.costBasis);

      return { currentValue, unrealizedPnl };
    } catch (error) {
      logger.error(
        `Failed to fetch AMM price for market ${market.id}`,
        error
      );
      // Fallback to last known value
      return {
        currentValue: Number(share.currentValue),
        unrealizedPnl: Number(share.unrealizedPnl),
      };
    }
  }

  /**
   * Record a new share purchase (called after trade execution)
   */
  async recordPurchase(
    userId: string,
    marketId: string,
    outcome: number,
    quantity: number,
    totalCost: number
  ) {
    const pricePerShare = totalCost / quantity;

    // Check if user already has a position
    const existingShare = await this.sharesRepository.findUserMarketShare(
      userId,
      marketId,
      outcome
    );

    if (existingShare) {
      // Average down/up the position
      const newQuantity = Number(existingShare.quantity) + quantity;
      const newCostBasis = Number(existingShare.costBasis) + totalCost;
      const newEntryPrice = newCostBasis / newQuantity;

      return await this.sharesRepository.updateSharePosition(
        existingShare.id,
        {
          quantity: newQuantity,
          costBasis: newCostBasis,
          entryPrice: newEntryPrice,
        }
      );
    }

    // Create new position
    return await this.sharesRepository.createShare({
      userId,
      marketId,
      outcome,
      quantity,
      costBasis: totalCost,
      entryPrice: pricePerShare,
    });
  }

  /**
   * Record a share sale (called after trade execution)
   */
  async recordSale(
    userId: string,
    marketId: string,
    outcome: number,
    quantity: number,
    saleProceeds: number
  ) {
    const share = await this.sharesRepository.findUserMarketShare(
      userId,
      marketId,
      outcome
    );

    if (!share) {
      throw new Error('No position found to sell');
    }

    if (Number(share.quantity) < quantity) {
      throw new Error('Insufficient shares to sell');
    }

    // Calculate realized PnL
    const avgCostPerShare = Number(share.costBasis) / Number(share.quantity);
    const costOfSoldShares = avgCostPerShare * quantity;
    const realizedPnl = saleProceeds - costOfSoldShares;

    // Update the share record
    return await this.sharesRepository.recordSale(
      share.id,
      quantity,
      realizedPnl
    );
  }

  /**
   * Get portfolio summary with aggregated metrics
   */
  async getPortfolioSummary(userId: string) {
    const summary = await this.sharesRepository.getPortfolioSummary(userId);

    // Calculate total PnL and return percentage
    const totalPnl = summary.totalUnrealizedPnl + summary.totalRealizedPnl;
    const returnPercentage =
      summary.totalCostBasis > 0
        ? (totalPnl / summary.totalCostBasis) * 100
        : 0;

    return {
      ...summary,
      totalPnl,
      returnPercentage,
    };
  }

  /**
   * Refresh all share values for a user (batch update)
   */
  async refreshUserPortfolio(userId: string) {
    const shares = await this.sharesRepository.findUserShares(userId, {
      includeMarket: true,
    });

    const updates = await Promise.all(
      shares.map(async (share) => {
        try {
          const { currentValue, unrealizedPnl } =
            await this.calculateCurrentValue(share);
          return {
            id: share.id,
            currentValue,
            unrealizedPnl,
          };
        } catch (error) {
          logger.warn(`Failed to calculate value for share ${share.id}`);
          return null;
        }
      })
    );

    const validUpdates = updates.filter((u) => u !== null) as Array<{
      id: string;
      currentValue: number;
      unrealizedPnl: number;
    }>;

    if (validUpdates.length > 0) {
      await this.sharesRepository.batchUpdateShareValues(validUpdates);
    }

    return { updated: validUpdates.length, total: shares.length };
  }

  /**
   * Get all positions for a specific market
   */
  async getMarketPositions(marketId: string) {
    return await this.sharesRepository.findMarketShares(marketId);
  }

  /**
   * Get position breakdown by outcome
   */
  async getPositionBreakdown(userId: string) {
    const shares = await this.sharesRepository.findUserShares(userId, {
      includeMarket: true,
    });

    const breakdown = shares.reduce(
      (acc, share) => {
        const outcome = share.outcome === 1 ? 'yes' : 'no';
        acc[outcome].count += 1;
        acc[outcome].totalValue += Number(share.currentValue);
        acc[outcome].totalCostBasis += Number(share.costBasis);
        acc[outcome].totalUnrealizedPnl += Number(share.unrealizedPnl);
        return acc;
      },
      {
        yes: {
          count: 0,
          totalValue: 0,
          totalCostBasis: 0,
          totalUnrealizedPnl: 0,
        },
        no: {
          count: 0,
          totalValue: 0,
          totalCostBasis: 0,
          totalUnrealizedPnl: 0,
        },
      }
    );

    return breakdown;
  }
}
