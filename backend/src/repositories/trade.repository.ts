// Trade repository - data access layer for trades
import { Trade, TradeType, TradeStatus } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

export class TradeRepository extends BaseRepository<Trade> {
  getModelName(): string {
    return 'trade';
  }

  async createTrade(data: {
    userId: string;
    marketId: string;
    tradeType: TradeType;
    outcome?: number;
    quantity: number;
    pricePerUnit: number;
    totalAmount: number;
    feeAmount: number;
    txHash: string;
  }): Promise<Trade> {
    return await this.prisma.trade.create({
      data: {
        ...data,
        status: TradeStatus.PENDING,
      },
    });
  }

  async confirmTrade(tradeId: string): Promise<Trade> {
    return await this.prisma.trade.update({
      where: { id: tradeId },
      data: {
        status: TradeStatus.CONFIRMED,
        confirmedAt: new Date(),
      },
    });
  }

  async failTrade(tradeId: string): Promise<Trade> {
    return await this.prisma.trade.update({
      where: { id: tradeId },
      data: {
        status: TradeStatus.FAILED,
      },
    });
  }

  async findByTxHash(txHash: string): Promise<Trade | null> {
    return await this.prisma.trade.findFirst({
      where: { txHash },
    });
  }

  async findUserTrades(
    userId: string,
    options?: {
      tradeType?: TradeType;
      status?: TradeStatus;
      skip?: number;
      take?: number;
    }
  ): Promise<Trade[]> {
    return await this.prisma.trade.findMany({
      where: {
        userId,
        ...(options?.tradeType && { tradeType: options.tradeType }),
        ...(options?.status && { status: options.status }),
      },
      orderBy: { createdAt: 'desc' },
      skip: options?.skip,
      take: options?.take || 50,
      include: {
        market: {
          select: {
            id: true,
            title: true,
            category: true,
          },
        },
      },
    });
  }

  async findMarketTrades(
    marketId: string,
    options?: {
      skip?: number;
      take?: number;
    }
  ): Promise<Trade[]> {
    return await this.prisma.trade.findMany({
      where: { marketId, status: TradeStatus.CONFIRMED },
      orderBy: { createdAt: 'desc' },
      skip: options?.skip,
      take: options?.take || 100,
    });
  }

  async getUserTradeVolume(userId: string): Promise<number> {
    const result = await this.prisma.trade.aggregate({
      where: {
        userId,
        status: TradeStatus.CONFIRMED,
        tradeType: { in: [TradeType.BUY, TradeType.SELL] },
      },
      _sum: { totalAmount: true },
    });

    return Number(result._sum.totalAmount || 0);
  }

  async getMarketTradeVolume(marketId: string): Promise<number> {
    const result = await this.prisma.trade.aggregate({
      where: {
        marketId,
        status: TradeStatus.CONFIRMED,
        tradeType: { in: [TradeType.BUY, TradeType.SELL] },
      },
      _sum: { totalAmount: true },
    });

    return Number(result._sum.totalAmount || 0);
  }

  async getTotalFeesCollected(): Promise<number> {
    const result = await this.prisma.trade.aggregate({
      where: { status: TradeStatus.CONFIRMED },
      _sum: { feeAmount: true },
    });

    return Number(result._sum.feeAmount || 0);
  }

  async getRecentTrades(limit: number = 20): Promise<Trade[]> {
    return await this.prisma.trade.findMany({
      where: { status: TradeStatus.CONFIRMED },
      orderBy: { confirmedAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
        market: {
          select: {
            id: true,
            title: true,
            category: true,
          },
        },
      },
    });
  }
}
