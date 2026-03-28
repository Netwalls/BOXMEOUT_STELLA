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
    return this.timedQuery('createTrade', () =>
      this.prisma.trade.create({
        data: { ...data, status: TradeStatus.PENDING },
      })
    );
  }

  async confirmTrade(tradeId: string): Promise<Trade> {
    return this.timedQuery('confirmTrade', () =>
      this.prisma.trade.update({
        where: { id: tradeId },
        data: { status: TradeStatus.CONFIRMED, confirmedAt: new Date() },
      })
    );
  }

  async failTrade(tradeId: string): Promise<Trade> {
    return this.timedQuery('failTrade', () =>
      this.prisma.trade.update({
        where: { id: tradeId },
        data: { status: TradeStatus.FAILED },
      })
    );
  }

  async findByTxHash(txHash: string): Promise<Trade | null> {
    return this.timedQuery('findByTxHash', () =>
      this.prisma.trade.findFirst({ where: { txHash } })
    );
  }

  async findUserTrades(
    userId: string,
    options?: {
      tradeType?: TradeType;
      status?: TradeStatus;
      outcome?: number;
      skip?: number;
      take?: number;
    }
  ): Promise<{ trades: Trade[]; total: number }> {
    return this.timedQuery('findUserTrades', async () => {
      const where = {
        userId,
        ...(options?.tradeType && { tradeType: options.tradeType }),
        ...(options?.status && { status: options.status }),
        ...(options?.outcome !== undefined && { outcome: options.outcome }),
      };

      const [trades, total] = await Promise.all([
        this.prisma.trade.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: options?.skip,
          take: options?.take || 50,
          include: {
            market: { select: { id: true, title: true, category: true } },
          },
        }),
        this.prisma.trade.count({ where }),
      ]);

      return { trades, total };
    });
}

  async findMarketTrades(
    marketId: string,
    options?: { outcome?: number; skip?: number; take?: number }
  ): Promise<{ trades: Trade[]; total: number }> {
    return this.timedQuery('findMarketTrades', async () => {
      const where = {
        marketId,
        status: TradeStatus.CONFIRMED,
        ...(options?.outcome !== undefined && { outcome: options.outcome }),
      };

      const [trades, total] = await Promise.all([
        this.prisma.trade.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: options?.skip,
          take: options?.take || 100,
        }),
        this.prisma.trade.count({ where }),
      ]);

      return { trades, total };
    });
  }

  async getUserTradeVolume(userId: string): Promise<number> {
    return this.timedQuery('getUserTradeVolume', async () => {
      const result = await this.prisma.trade.aggregate({
        where: {
          userId,
          status: TradeStatus.CONFIRMED,
          tradeType: { in: [TradeType.BUY, TradeType.SELL] },
        },
        _sum: { totalAmount: true },
      });
      return Number(result._sum.totalAmount || 0);
    });
  }

  async getMarketTradeVolume(marketId: string): Promise<number> {
    return this.timedQuery('getMarketTradeVolume', async () => {
      const result = await this.prisma.trade.aggregate({
        where: {
          marketId,
          status: TradeStatus.CONFIRMED,
          tradeType: { in: [TradeType.BUY, TradeType.SELL] },
        },
        _sum: { totalAmount: true },
      });
      return Number(result._sum.totalAmount || 0);
    });
  }

  async getTotalFeesCollected(): Promise<number> {
    return this.timedQuery('getTotalFeesCollected', async () => {
      const result = await this.prisma.trade.aggregate({
        where: { status: TradeStatus.CONFIRMED },
        _sum: { feeAmount: true },
      });
      return Number(result._sum.feeAmount || 0);
    });
  }

  async getRecentTrades(limit: number = 20): Promise<Trade[]> {
    return this.timedQuery('getRecentTrades', () =>
      this.prisma.trade.findMany({
        where: { status: TradeStatus.CONFIRMED },
        orderBy: { confirmedAt: 'desc' },
        take: limit,
        include: {
          user: { select: { id: true, username: true, displayName: true } },
          market: { select: { id: true, title: true, category: true } },
        },
      })
    );
  }

  async createBuyTrade(data: {
    userId: string;
    marketId: string;
    outcome: number;
    quantity: number;
    pricePerUnit: number;
    totalAmount: number;
    feeAmount: number;
    txHash: string;
  }): Promise<Trade> {
    return this.createTrade({ ...data, tradeType: TradeType.BUY });
  }

  async createSellTrade(data: {
    userId: string;
    marketId: string;
    outcome: number;
    quantity: number;
    pricePerUnit: number;
    totalAmount: number;
    feeAmount: number;
    txHash: string;
  }): Promise<Trade> {
    return this.createTrade({ ...data, tradeType: TradeType.SELL });
  }

  async findByUserAndMarket(
    userId: string,
    marketId: string
  ): Promise<Trade[]> {
    return this.timedQuery('findByUserAndMarket', () =>
      this.prisma.trade.findMany({
        where: { userId, marketId },
        orderBy: { createdAt: 'desc' },
      })
    );
  }
}
