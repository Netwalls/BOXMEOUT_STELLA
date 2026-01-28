// backend/src/repositories/share.repository.ts
// Repository for managing user share positions

import { prisma } from '../database/prisma.js';
import { Prisma, Share } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export class ShareRepository {
  /**
   * Find a user's share position for a specific market and outcome
   */
  async findByUserMarketOutcome(
    userId: string,
    marketId: string,
    outcome: number
  ): Promise<Share | null> {
    return prisma.share.findFirst({
      where: {
        userId,
        marketId,
        outcome,
      },
    });
  }

  /**
   * Find all shares for a user in a specific market
   */
  async findByUserAndMarket(userId: string, marketId: string): Promise<Share[]> {
    return prisma.share.findMany({
      where: {
        userId,
        marketId,
      },
      include: {
        market: true,
      },
    });
  }

  /**
   * Create a new share position
   */
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
    return prisma.share.create({
      data: {
        userId: data.userId,
        marketId: data.marketId,
        outcome: data.outcome,
        quantity: new Decimal(data.quantity),
        costBasis: new Decimal(data.costBasis),
        entryPrice: new Decimal(data.entryPrice),
        currentValue: new Decimal(data.currentValue),
        unrealizedPnl: new Decimal(data.unrealizedPnl),
      },
    });
  }

  /**
   * Update an existing share position
   */
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

    if (data.quantity !== undefined) updateData.quantity = new Decimal(data.quantity);
    if (data.costBasis !== undefined) updateData.costBasis = new Decimal(data.costBasis);
    if (data.currentValue !== undefined) updateData.currentValue = new Decimal(data.currentValue);
    if (data.unrealizedPnl !== undefined) updateData.unrealizedPnl = new Decimal(data.unrealizedPnl);
    if (data.soldQuantity !== undefined) updateData.soldQuantity = new Decimal(data.soldQuantity);
    if (data.soldAt !== undefined) updateData.soldAt = data.soldAt;
    if (data.realizedPnl !== undefined) updateData.realizedPnl = new Decimal(data.realizedPnl);

    return prisma.share.update({
      where: { id: shareId },
      data: updateData,
    });
  }

  /**
   * Increment shares for an existing position (used when buying more)
   */
  async incrementShares(
    shareId: string,
    additionalQuantity: number,
    additionalCost: number,
    newEntryPrice: number
  ): Promise<Share> {
    const share = await prisma.share.findUnique({ where: { id: shareId } });
    if (!share) {
      throw new Error('Share position not found');
    }

    const newQuantity = Number(share.quantity) + additionalQuantity;
    const newCostBasis = Number(share.costBasis) + additionalCost;
    const newCurrentValue = newQuantity * newEntryPrice;
    const newUnrealizedPnl = newCurrentValue - newCostBasis;

    return this.updatePosition(shareId, {
      quantity: newQuantity,
      costBasis: newCostBasis,
      currentValue: newCurrentValue,
      unrealizedPnl: newUnrealizedPnl,
    });
  }

  /**
   * Decrement shares for an existing position (used when selling)
   */
  async decrementShares(
    shareId: string,
    quantityToSell: number,
    proceeds: number
  ): Promise<Share> {
    const share = await prisma.share.findUnique({ where: { id: shareId } });
    if (!share) {
      throw new Error('Share position not found');
    }

    const currentQuantity = Number(share.quantity);
    if (currentQuantity < quantityToSell) {
      throw new Error('Insufficient shares to sell');
    }

    const newQuantity = currentQuantity - quantityToSell;
    const proportionSold = quantityToSell / currentQuantity;
    const costOfSoldShares = Number(share.costBasis) * proportionSold;
    const newCostBasis = Number(share.costBasis) - costOfSoldShares;
    const newSoldQuantity = Number(share.soldQuantity) + quantityToSell;
    const tradeRealizedPnl = proceeds - costOfSoldShares;
    const totalRealizedPnl = Number(share.realizedPnl || 0) + tradeRealizedPnl;

    // Update current value and unrealized PnL based on remaining shares
    const currentPrice = Number(share.entryPrice); // Use current market price if available
    const newCurrentValue = newQuantity * currentPrice;
    const newUnrealizedPnl = newCurrentValue - newCostBasis;

    return this.updatePosition(shareId, {
      quantity: newQuantity,
      costBasis: newCostBasis,
      currentValue: newCurrentValue,
      unrealizedPnl: newUnrealizedPnl,
      soldQuantity: newSoldQuantity,
      soldAt: new Date(),
      realizedPnl: totalRealizedPnl,
    });
  }

  /**
   * Get all active positions for a user (quantity > 0)
   */
  async findActivePositionsByUser(userId: string): Promise<Share[]> {
    return prisma.share.findMany({
      where: {
        userId,
        quantity: {
          gt: 0,
        },
      },
      include: {
        market: true,
      },
      orderBy: {
        acquiredAt: 'desc',
      },
    });
  }

  /**
   * Delete a share position (if quantity becomes 0)
   */
  async deletePosition(shareId: string): Promise<void> {
    await prisma.share.delete({
      where: { id: shareId },
    });
  }
}

export const shareRepository = new ShareRepository();
