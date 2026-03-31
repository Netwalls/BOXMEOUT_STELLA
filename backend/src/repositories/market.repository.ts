// Market repository - data access layer for markets
import { Market, MarketStatus, MarketCategory } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

export class MarketRepository extends BaseRepository<Market> {
  getModelName(): string {
    return 'market';
  }

  async findByIdWithDetails(marketId: string): Promise<Market | null> {
    return this.timedQuery('findByIdWithDetails', () =>
      this.prisma.market.findUnique({
        where: { id: marketId },
        include: {
          creator: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
          _count: { select: { predictions: true, trades: true } },
        },
      })
    );
  }

  async findByContractAddress(contractAddress: string): Promise<Market | null> {
    return this.timedQuery('findByContractAddress', () =>
      this.prisma.market.findUnique({ where: { contractAddress } })
    );
  }

  async addAttestation(
    marketId: string,
    oracleId: string,
    outcome: number,
    txHash: string
  ) {
    return this.timedQuery('addAttestation', () =>
      this.prisma.$transaction(async (tx) => {
        const attestation = await tx.attestation.create({
          data: { marketId, oracleId, outcome, txHash },
        });
        const market = await tx.market.update({
          where: { id: marketId },
          data: { attestationCount: { increment: 1 } },
        });
        return { attestation, market };
      })
    );
  }

  async hasAttested(marketId: string, oracleId: string): Promise<boolean> {
    return this.timedQuery('hasAttested', async () => {
      const record = await this.prisma.attestation.findUnique({
        where: { marketId_oracleId: { marketId, oracleId } },
      });
      return !!record;
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
    return this.timedQuery('createMarket', () =>
      this.prisma.market.create({
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
      })
    );
  }

  async findActiveMarkets(options?: {
    category?: MarketCategory;
    skip?: number;
    take?: number;
  }): Promise<Market[]> {
    return this.timedQuery('findActiveMarkets', () =>
      this.prisma.market.findMany({
        where: {
          status: MarketStatus.OPEN,
          closingAt: { gt: new Date() },
          ...(options?.category && { category: options.category }),
        },
        orderBy: { closingAt: 'asc' },
        skip: options?.skip,
        take: options?.take || 20,
        include: {
          creator: { select: { id: true, username: true, displayName: true } },
        },
      })
    );
  }

  async findMarketsByCreator(creatorId: string): Promise<Market[]> {
    return this.timedQuery('findMarketsByCreator', () =>
      this.prisma.market.findMany({
        where: { creatorId },
        orderBy: { createdAt: 'desc' },
      })
    );
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
    return this.timedQuery('updateMarketStatus', () =>
      this.prisma.market.update({
        where: { id: marketId },
        data: { status, ...additionalData },
      })
    );
  }

  async updateMarketVolume(
    marketId: string,
    volumeChange: number,
    incrementParticipants: boolean = false
  ): Promise<Market> {
    return this.timedQuery('updateMarketVolume', () =>
      this.prisma.market.update({
        where: { id: marketId },
        data: {
          totalVolume: { increment: volumeChange },
          ...(incrementParticipants && { participantCount: { increment: 1 } }),
        },
      })
    );
  }

  async updateLiquidity(
    marketId: string,
    yesLiquidity: number,
    noLiquidity: number
  ): Promise<Market> {
    return this.timedQuery('updateLiquidity', () =>
      this.prisma.market.update({
        where: { id: marketId },
        data: { yesLiquidity, noLiquidity },
      })
    );
  }

  async setPoolTxHash(marketId: string, txHash: string): Promise<Market> {
    return this.timedQuery('setPoolTxHash', () =>
      this.prisma.market.update({
        where: { id: marketId },
        data: { poolTxHash: txHash },
      })
    );
  }

  async addFeesCollected(marketId: string, feeAmount: number): Promise<Market> {
    return this.timedQuery('addFeesCollected', () =>
      this.prisma.market.update({
        where: { id: marketId },
        data: { feesCollected: { increment: feeAmount } },
      })
    );
  }

  async getTrendingMarkets(limit: number = 10): Promise<Market[]> {
    return this.timedQuery('getTrendingMarkets', () =>
      this.prisma.market.findMany({
        where: { status: MarketStatus.OPEN, closingAt: { gt: new Date() } },
        orderBy: [{ totalVolume: 'desc' }, { participantCount: 'desc' }],
        take: limit,
        include: {
          creator: { select: { id: true, username: true, displayName: true } },
        },
      })
    );
  }

  async getMarketsByCategory(
    category: MarketCategory,
    skip?: number,
    take?: number
  ): Promise<Market[]> {
    return this.timedQuery('getMarketsByCategory', () =>
      this.prisma.market.findMany({
        where: { category, status: MarketStatus.OPEN },
        orderBy: { closingAt: 'asc' },
        skip,
        take: take || 20,
      })
    );
  }

  async getClosedMarketsAwaitingResolution(): Promise<Market[]> {
    return this.timedQuery('getClosedMarketsAwaitingResolution', () =>
      this.prisma.market.findMany({
        where: { status: MarketStatus.CLOSED },
        orderBy: { closedAt: 'asc' },
      })
    );
  }

  async getClosingMarkets(withinHours: number = 24): Promise<Market[]> {
    return this.timedQuery('getClosingMarkets', () => {
      const closingTime = new Date();
      closingTime.setHours(closingTime.getHours() + withinHours);
      return this.prisma.market.findMany({
        where: {
          status: MarketStatus.OPEN,
          closingAt: { gte: new Date(), lte: closingTime },
        },
        orderBy: { closingAt: 'asc' },
      });
    });
  }

  /**
   * Find OPEN markets whose closingAt has already passed — ready to be closed.
   */
  async findExpiredOpenMarkets(): Promise<Market[]> {
    return await this.prisma.market.findMany({
      where: {
        status: MarketStatus.OPEN,
        closingAt: { lt: new Date() },
      },
      orderBy: { closingAt: 'asc' },
    });
  }

  /**
   * Find DISPUTED markets whose resolvedAt is older than windowMs milliseconds.
   * These have passed the dispute window and can be finalized on-chain.
   */
  async findDisputedMarketsReadyToFinalize(
    windowMs: number
  ): Promise<Market[]> {
    const cutoff = new Date(Date.now() - windowMs);
    return await this.prisma.market.findMany({
      where: {
        status: MarketStatus.DISPUTED,
        resolvedAt: { lt: cutoff },
      },
      orderBy: { resolvedAt: 'asc' },
    });
  }

  /**
   * Find RESOLVED markets that still have REVEALED (unsettled) predictions.
   */
  async findResolvedMarketsWithUnsettledPredictions(): Promise<Market[]> {
    return await this.prisma.market.findMany({
      where: {
        status: MarketStatus.RESOLVED,
        predictions: {
          some: { status: 'REVEALED' },
        },
      },
      orderBy: { resolvedAt: 'asc' },
    });
  }

  async getMarketStatistics() {
    return this.timedQuery('getMarketStatistics', async () => {
      const [totalMarkets, activeMarkets, totalVolume, avgParticipants] =
        await Promise.all([
          this.prisma.market.count(),
          this.prisma.market.count({ where: { status: MarketStatus.OPEN } }),
          this.prisma.market.aggregate({ _sum: { totalVolume: true } }),
          this.prisma.market.aggregate({ _avg: { participantCount: true } }),
        ]);
      return {
        totalMarkets,
        activeMarkets,
        totalVolume: totalVolume._sum.totalVolume || 0,
        avgParticipants: avgParticipants._avg.participantCount || 0,
      };
    });
  }
}
