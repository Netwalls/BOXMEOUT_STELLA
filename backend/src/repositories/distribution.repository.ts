import { BaseRepository, toRepositoryError } from './base.repository.js';
import {
  Distribution,
  DistributionType,
  DistributionStatus,
  PrismaClient,
} from '@prisma/client';

export class DistributionRepository extends BaseRepository<Distribution> {
﻿// Distribution repository - tracks per-user winnings payouts for resolved markets.
// Auditable and idempotent: markPaid is a no-op if the record is already PAID.
import { WinningsPayout, PayoutStatus, PrismaClient } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

  constructor(prismaClient?: PrismaClient) {
    super(prismaClient);
  }

  getModelName(): string {
    return 'winningsPayout';
  }

  /**
   * Create a new payout record in PENDING state.
   * The (userId, marketId) pair is unique - one payout per winner per market.
   */
  async createDistribution(data: {
    userId: string;
    marketId: string;
    amount: number;
    txHash?: string;
  }): Promise<WinningsPayout> {
    return await this.prisma.winningsPayout.create({
      data: {
        userId: data.userId,
        marketId: data.marketId,
        amount: data.amount,
        status: PayoutStatus.PENDING,
        txHash: data.txHash ?? null,
      },
    });
  }

  /**
   * Idempotent transition PENDING -> PAID.
   * If the record is already PAID this returns the existing record unchanged.
   */
  async markPaid(id: string, txHash: string): Promise<WinningsPayout> {
    return await this.prisma.$transaction(async (tx) => {
      const payout = await tx.winningsPayout.findUnique({ where: { id } });

      if (!payout) {
        throw new Error(`WinningsPayout not found: ${id}`);
      }

      if (payout.status === PayoutStatus.PAID) {
        return payout; // idempotent guard
      }

      return await tx.winningsPayout.update({
        where: { id },
        data: { status: PayoutStatus.PAID, txHash, paidAt: new Date() },
      });
    });
  }

  /** Mark a payout as FAILED. */
  async markFailed(id: string): Promise<WinningsPayout> {
    return await this.prisma.winningsPayout.update({
      where: { id },
      data: { status: PayoutStatus.FAILED },
    });
  }

  async findByTxHash(txHash: string): Promise<Distribution | null> {
    try {
      return await this.getModel().findFirst({ where: { txHash } });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  /** All payout records for a given market, oldest first. */
  async findByMarket(marketId: string): Promise<WinningsPayout[]> {
    return await this.prisma.winningsPayout.findMany({
      where: { marketId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** All payout records for a given user, newest first. */
  async findByUser(userId: string): Promise<WinningsPayout[]> {
    return await this.prisma.winningsPayout.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Look up the single payout for a (user, market) pair. */
  async findByUserAndMarket(
    userId: string,
    marketId: string
  ): Promise<WinningsPayout | null> {
    return await this.prisma.winningsPayout.findUnique({
      where: { userId_marketId: { userId, marketId } },
    });
  }
}
