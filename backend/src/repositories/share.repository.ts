// Share repository - data access layer for user share positions
import { Share, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BaseRepository } from './base.repository.js';

export class ShareRepository extends BaseRepository<Share> {
  getModelName(): string {
    return 'share';
  }

  async findByUserMarketOutcome(
    userId: string,
    marketId: string,
    outcome: number
  ): Promise<Share | null> {
    return this.prisma.share.findFirst({
      where: { userId, marketId, outcome },
    });
  }

  async findByUserAndMarket(
    userId: string,
    marketId: string
  ): Promise<Share[]> {
    return this.prisma.share.findMany({
      where: { userId, marketId },
      include: { market: true },
    });
  }

  async createPosition(data: {
    userId: string;
    marketId: string;
    outcome: number;
    quantity: number;
    costBasis: number;
    entryPrice: number;
    currentValue: number;
    unrealizedPnl: number;
  }): Promise<Share> {
    return this.create({
      userId: data.userId,
      marketId: data.marketId,
      outcome: data.outcome,
      quantity: new Decimal(data.quantity),
      costBasis: new Decimal(data.costBasis),
      entryPrice: new Decimal(data.entryPrice),
      currentValue: new Decimal(data.currentValue),
      unrealizedPnl: new Decimal(data.unrealizedPnl),
    });
  }

  async updatePosition(
    shareId: string,
    data: Partial<{
      quantity: number;
      costBasis: number;
      currentValue: number;
      unrealizedPnl: number;
      soldQuantity: number;
      soldAt: Date;
      realizedPnl: number;
    }>
  ): Promise<Share> {
    const updateData: Prisma.ShareUpdateInput = {};

    if (data.quantity !== undefined)
      updateData.quantity = new Decimal(data.quantity);
    if (data.costBasis !== undefined)
      updateData.costBasis = new Decimal(data.costBasis);
    if (data.currentValue !== undefined)
      updateData.currentValue = new Decimal(data.currentValue);
    if (data.unrealizedPnl !== undefined)
      updateData.unrealizedPnl = new Decimal(data.unrealizedPnl);
    if (data.soldQuantity !== undefined)
      updateData.soldQuantity = new Decimal(data.soldQuantity);
    if (data.soldAt !== undefined) updateData.soldAt = data.soldAt;
    if (data.realizedPnl !== undefined)
      updateData.realizedPnl = new Decimal(data.realizedPnl);

    return this.update(shareId, updateData);
  }

  async incrementShares(
    shareId: string,
    additionalQuantity: number,
    additionalCost: number,
    newEntryPrice: number
  ): Promise<Share> {
    const share = await this.findById(shareId);
    if (!share) throw new Error('Share position not found');

    const newQuantity = Number(share.quantity) + additionalQuantity;
    const newCostBasis = Number(share.costBasis) + additionalCost;
    const newCurrentValue = newQuantity * newEntryPrice;

    return this.updatePosition(shareId, {
      quantity: newQuantity,
      costBasis: newCostBasis,
      currentValue: newCurrentValue,
      unrealizedPnl: newCurrentValue - newCostBasis,
    });
  }

  async decrementShares(
    shareId: string,
    quantityToSell: number,
    proceeds: number
  ): Promise<Share> {
    const share = await this.findById(shareId);
    if (!share) throw new Error('Share position not found');

    const currentQuantity = Number(share.quantity);
    if (currentQuantity < quantityToSell)
      throw new Error('Insufficient shares to sell');

    const newQuantity = currentQuantity - quantityToSell;
    const proportionSold = quantityToSell / currentQuantity;
    const costOfSoldShares = Number(share.costBasis) * proportionSold;
    const newCostBasis = Number(share.costBasis) - costOfSoldShares;
    const newSoldQuantity = Number(share.soldQuantity) + quantityToSell;
    const totalRealizedPnl =
      Number(share.realizedPnl || 0) + (proceeds - costOfSoldShares);
    const currentPrice = Number(share.entryPrice);
    const newCurrentValue = newQuantity * currentPrice;

    return this.updatePosition(shareId, {
      quantity: newQuantity,
      costBasis: newCostBasis,
      currentValue: newCurrentValue,
      unrealizedPnl: newCurrentValue - newCostBasis,
      soldQuantity: newSoldQuantity,
      soldAt: new Date(),
      realizedPnl: totalRealizedPnl,
    });
  }

  async findActivePositionsByUser(userId: string): Promise<Share[]> {
    return this.prisma.share.findMany({
      where: { userId, quantity: { gt: 0 } },
      include: { market: true },
      orderBy: { acquiredAt: 'desc' },
    });
  }

  async deletePosition(shareId: string): Promise<void> {
    await this.delete(shareId);
  }
}

export const shareRepository = new ShareRepository();
