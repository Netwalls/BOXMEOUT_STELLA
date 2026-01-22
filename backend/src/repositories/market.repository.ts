// Market repository - data access layer for markets
import { Market, MarketStatus, MarketCategory } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

export class MarketRepository extends BaseRepository<Market> {
  getModelName(): string {
    return 'market';
  }

  async findByContractAddress(contractAddress: string): Promise<Market | null> {
    return await this.prisma.market.findUnique({
      where: { contractAddress },
    });
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
  }): Promise<Market> {
    return await this.prisma.market.create({
      data,
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async findActiveMarkets(options?: {
    category?: MarketCategory;
    skip?: number;
    take?: number;
  }): Promise<Market[]> {
    return await this.prisma.market.findMany({
      where: {
        status: MarketStatus.OPEN,
        closingAt: { gt: new Date() },
        ...(options?.category && { category: options.category }),
      },
      orderBy: { closingAt: 'asc' },
      skip: options?.skip,
      take: options?.take || 20,
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });
  }

  async findMarketsByCreator(creatorId: string): Promise<Market[]> {
    return await this.prisma.market.findMany({
      where: { creatorId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateMarketStatus(
    marketId: string,
    status: MarketStatus,
    additionalData?: {
      closedAt?: Date;
      resolvedAt?: Date;
      winningOutcome?: number;
      resolutionSource?: string;
    }
  ): Promise<Market> {
    return await this.prisma.market.update({
      where: { id: marketId },
      data: {
        status,
        ...additionalData,
      },
    });
  }

  async updateMarketVolume(
    marketId: string,
    volumeChange: number,
    incrementParticipants: boolean = false
  ): Promise<Market> {
    return await this.prisma.market.update({
      where: { id: marketId },
      data: {
        totalVolume: { increment: volumeChange },
        ...(incrementParticipants && { participantCount: { increment: 1 } }),
      },
    });
  }

  async updateLiquidity(
    marketId: string,
    yesLiquidity: number,
    noLiquidity: number
  ): Promise<Market> {
    return await this.prisma.market.update({
      where: { id: marketId },
      data: { yesLiquidity, noLiquidity },
    });
  }

  async addFeesCollected(marketId: string, feeAmount: number): Promise<Market> {
    return await this.prisma.market.update({
      where: { id: marketId },
      data: {
        feesCollected: { increment: feeAmount },
      },
    });
  }

  async getTrendingMarkets(limit: number = 10): Promise<Market[]> {
    return await this.prisma.market.findMany({
      where: {
        status: MarketStatus.OPEN,
        closingAt: { gt: new Date() },
      },
      orderBy: [{ totalVolume: 'desc' }, { participantCount: 'desc' }],
      take: limit,
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });
  }

  async getMarketsByCategory(
    category: MarketCategory,
    skip?: number,
    take?: number
  ): Promise<Market[]> {
    return await this.prisma.market.findMany({
      where: {
        category,
        status: MarketStatus.OPEN,
      },
      orderBy: { closingAt: 'asc' },
      skip,
      take: take || 20,
    });
  }

  async getClosingMarkets(withinHours: number = 24): Promise<Market[]> {
    const closingTime = new Date();
    closingTime.setHours(closingTime.getHours() + withinHours);

    return await this.prisma.market.findMany({
      where: {
        status: MarketStatus.OPEN,
        closingAt: {
          gte: new Date(),
          lte: closingTime,
        },
      },
      orderBy: { closingAt: 'asc' },
    });
  }

  async getMarketStatistics() {
    const [totalMarkets, activeMarkets, totalVolume, avgParticipants] =
      await Promise.all([
        this.prisma.market.count(),
        this.prisma.market.count({ where: { status: MarketStatus.OPEN } }),
        this.prisma.market.aggregate({
          _sum: { totalVolume: true },
        }),
        this.prisma.market.aggregate({
          _avg: { participantCount: true },
        }),
      ]);

    return {
      totalMarkets,
      activeMarkets,
      totalVolume: totalVolume._sum.totalVolume || 0,
      avgParticipants: avgParticipants._avg.participantCount || 0,
    };
  }
}
