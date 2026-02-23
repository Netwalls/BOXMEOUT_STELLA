// Shares repository - data access layer for portfolio positions
import { Share } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

export class SharesRepository extends BaseRepository<Share> {
  getModelName(): string {
    return 'share';
  }

  /**
   * Find all shares for a user
   */
  async findUserShares(
    userId: string,
    options?: {
      marketId?: string;
      includeMarket?: boolean;
      skip?: number;
      take?: number;
    }
  ): Promise<any[]> {
    return await this.prisma.share.findMany({
      where: {
        userId,
        ...(options?.marketId && { marketId: options.marketId }),
        quantity: { gt: 0 }, // Only active positions
      },
      orderBy: { acquiredAt: 'desc' },
      skip: options?.skip,
      take: options?.take,
      ...(options?.includeMarket && {
        include: {
          market: {
            select: {
              id: true,
              title: true,
              category: true,
              status: true,
              outcomeA: true,
              outcomeB: true,
              closingAt: true,
            },
          },
        },
      }),
    });
  }

  /**
   * Find a specific share position
   */
  async findUserMarketShare(
    userId: string,
    marketId: string,
    outcome: number
  ): Promise<Share | null> {
    return await this.prisma.share.findFirst({
      where: {
        userId,
        marketId,
        outcome,
      },
    });
  }

  /**
   * Create a new share position
   */
  async createShare(data: {
    userId: string;
    marketId: string;
    outcome: number;
    quantity: number;
    costBasis: number;
    entryPrice: number;
  }): Promise<Share> {
    return await this.prisma.share.create({
      data: {
        ...data,
        currentValue: data.costBasis,
        unrealizedPnl: 0,
      },
    });
  }

  /**
   * Update share quantity and cost basis (for averaging)
   */
  async updateSharePosition(
    shareId: string,
    data: {
      quantity: number;
      costBasis: number;
      entryPrice: number;
    }
  ): Promise<Share> {
    return await this.prisma.share.update({
      where: { id: shareId },
      data,
    });
  }

  /**
   * Update current value and unrealized PnL
   */
  async updateShareValue(
    shareId: string,
    currentValue: number,
    unrealizedPnl: number
  ): Promise<Share> {
    return await this.prisma.share.update({
      where: { id: shareId },
      data: {
        currentValue,
        unrealizedPnl,
      },
    });
  }

  /**
   * Record a partial or full sale
   */
  async recordSale(
    shareId: string,
    soldQuantity: number,
    realizedPnl: number
  ): Promise<Share> {
    const share = await this.findById(shareId);
    if (!share) throw new Error('Share not found');

    const newSoldQuantity = Number(share.soldQuantity) + soldQuantity;
    const totalQuantity = Number(share.quantity);

    return await this.prisma.share.update({
      where: { id: shareId },
      data: {
        soldQuantity: newSoldQuantity,
        quantity: totalQuantity - soldQuantity,
        realizedPnl: realizedPnl,
        soldAt: new Date(),
      },
    });
  }

  /**
   * Get portfolio summary statistics
   */
  async getPortfolioSummary(userId: string): Promise<{
    totalPositions: number;
    totalCostBasis: number;
    totalCurrentValue: number;
    totalUnrealizedPnl: number;
    totalRealizedPnl: number;
  }> {
    const [activeShares, allShares] = await Promise.all([
      this.prisma.share.findMany({
        where: {
          userId,
          quantity: { gt: 0 },
        },
      }),
      this.prisma.share.findMany({
        where: { userId },
      }),
    ]);

    const totalCostBasis = activeShares.reduce(
      (sum: number, share: Share) => sum + Number(share.costBasis),
      0
    );

    const totalCurrentValue = activeShares.reduce(
      (sum: number, share: Share) => sum + Number(share.currentValue),
      0
    );

    const totalUnrealizedPnl = activeShares.reduce(
      (sum: number, share: Share) => sum + Number(share.unrealizedPnl),
      0
    );

    const totalRealizedPnl = allShares.reduce(
      (sum: number, share: Share) => sum + Number(share.realizedPnl || 0),
      0
    );

    return {
      totalPositions: activeShares.length,
      totalCostBasis,
      totalCurrentValue,
      totalUnrealizedPnl,
      totalRealizedPnl,
    };
  }

  /**
   * Get shares by market
   */
  async findMarketShares(marketId: string): Promise<Share[]> {
    return await this.prisma.share.findMany({
      where: {
        marketId,
        quantity: { gt: 0 },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });
  }

  /**
   * Batch update share values (for price updates)
   */
  async batchUpdateShareValues(
    updates: Array<{
      id: string;
      currentValue: number;
      unrealizedPnl: number;
    }>
  ): Promise<void> {
    await this.prisma.$transaction(
      updates.map((update) =>
        this.prisma.share.update({
          where: { id: update.id },
          data: {
            currentValue: update.currentValue,
            unrealizedPnl: update.unrealizedPnl,
          },
        })
      )
    );
  }
}
