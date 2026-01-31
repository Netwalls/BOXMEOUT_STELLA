// backend/src/services/trading.service.ts
// Trading service - orchestrates buy/sell operations

import { MarketStatus } from '@prisma/client';
import { ammService } from './blockchain/amm.js';
import { shareRepository } from '../repositories/share.repository.js';
import { TradeRepository } from '../repositories/trade.repository.js';
import { prisma } from '../database/prisma.js';
import { Decimal } from '@prisma/client/runtime/library';

const tradeRepository = new TradeRepository();

interface BuySharesParams {
  userId: string;
  marketId: string;
  outcome: number;
  amount: number;
  minShares?: number;
}

interface BuySharesResult {
  sharesBought: number;
  pricePerUnit: number;
  totalCost: number;
  feeAmount: number;
  txHash: string;
  tradeId: string;
  newSharePosition: {
    totalShares: number;
    averagePrice: number;
  };
}

interface SellSharesParams {
  userId: string;
  marketId: string;
  outcome: number;
  shares: number;
  minPayout?: number;
}

interface SellSharesResult {
  sharesSold: number;
  pricePerUnit: number;
  payout: number;
  feeAmount: number;
  txHash: string;
  tradeId: string;
  remainingShares: number;
}

interface MarketOddsResult {
  yesOdds: number;
  noOdds: number;
  yesPercentage: number;
  noPercentage: number;
  yesLiquidity: number;
  noLiquidity: number;
  totalLiquidity: number;
}

export class TradingService {
  /**
   * Buy shares for a specific market outcome
   */
  async buyShares(params: BuySharesParams): Promise<BuySharesResult> {
    const { userId, marketId, outcome, amount, minShares } = params;

    // Validate outcome
    if (![0, 1].includes(outcome)) {
      throw new Error('Invalid outcome. Must be 0 (NO) or 1 (YES)');
    }

    // Validate amount
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    // Check if market exists and is OPEN
    const market = await prisma.market.findUnique({
      where: { id: marketId },
    });

    if (!market) {
      throw new Error('Market not found');
    }

    if (market.status !== MarketStatus.OPEN) {
      throw new Error(
        `Market is ${market.status}. Trading is only allowed for OPEN markets.`
      );
    }

    // Check user balance
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const userBalance = Number(user.usdcBalance);
    if (userBalance < amount) {
      throw new Error(
        `Insufficient balance. Available: ${userBalance} USDC, Required: ${amount} USDC`
      );
    }

    // Set minimum shares to 95% of expected if not provided (5% slippage tolerance)
    const calculatedMinShares = minShares || amount * 0.95;

    // Call AMM contract to buy shares
    const buyResult = await ammService.buyShares({
      marketId,
      outcome,
      amountUsdc: amount,
      minShares: calculatedMinShares,
    });

    // Verify slippage protection
    if (buyResult.sharesReceived < calculatedMinShares) {
      throw new Error(
        `Slippage exceeded. Expected at least ${calculatedMinShares} shares, got ${buyResult.sharesReceived}`
      );
    }

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Create trade record
      const trade = await tradeRepository.createBuyTrade({
        userId,
        marketId,
        outcome,
        quantity: buyResult.sharesReceived,
        pricePerUnit: buyResult.pricePerUnit,
        totalAmount: buyResult.totalCost,
        feeAmount: buyResult.feeAmount,
        txHash: buyResult.txHash,
      });

      // Confirm trade immediately (since blockchain transaction succeeded)
      await tradeRepository.confirmTrade(trade.id);

      // Update or create share position
      const existingShare = await shareRepository.findByUserMarketOutcome(
        userId,
        marketId,
        outcome
      );

      let updatedShare;
      if (existingShare) {
        // Add to existing position
        updatedShare = await shareRepository.incrementShares(
          existingShare.id,
          buyResult.sharesReceived,
          buyResult.totalCost,
          buyResult.pricePerUnit
        );
      } else {
        // Create new position
        updatedShare = await shareRepository.createPosition({
          userId,
          marketId,
          outcome,
          quantity: buyResult.sharesReceived,
          costBasis: buyResult.totalCost,
          entryPrice: buyResult.pricePerUnit,
          currentValue: buyResult.sharesReceived * buyResult.pricePerUnit,
          unrealizedPnl: 0, // No PnL on initial purchase
        });
      }

      // Deduct USDC from user balance
      await tx.user.update({
        where: { id: userId },
        data: {
          usdcBalance: {
            decrement: new Decimal(buyResult.totalCost),
          },
        },
      });

      // Update market volume
      await tx.market.update({
        where: { id: marketId },
        data: {
          totalVolume: {
            increment: new Decimal(buyResult.totalCost),
          },
        },
      });

      return {
        trade,
        share: updatedShare,
      };
    });

    return {
      sharesBought: buyResult.sharesReceived,
      pricePerUnit: buyResult.pricePerUnit,
      totalCost: buyResult.totalCost,
      feeAmount: buyResult.feeAmount,
      txHash: buyResult.txHash,
      tradeId: result.trade.id,
      newSharePosition: {
        totalShares: Number(result.share.quantity),
        averagePrice:
          Number(result.share.costBasis) / Number(result.share.quantity),
      },
    };
  }

  /**
   * Sell shares for a specific market outcome
   */
  async sellShares(params: SellSharesParams): Promise<SellSharesResult> {
    const { userId, marketId, outcome, shares, minPayout } = params;

    // Validate outcome
    if (![0, 1].includes(outcome)) {
      throw new Error('Invalid outcome. Must be 0 (NO) or 1 (YES)');
    }

    // Validate shares
    if (shares <= 0) {
      throw new Error('Shares must be greater than 0');
    }

    // Check if market exists
    const market = await prisma.market.findUnique({
      where: { id: marketId },
    });

    if (!market) {
      throw new Error('Market not found');
    }

    // Check if user has sufficient shares
    const userShare = await shareRepository.findByUserMarketOutcome(
      userId,
      marketId,
      outcome
    );

    if (!userShare) {
      throw new Error(
        `No shares found for outcome ${outcome === 0 ? 'NO' : 'YES'}`
      );
    }

    const availableShares = Number(userShare.quantity);
    if (availableShares < shares) {
      throw new Error(
        `Insufficient shares. Available: ${availableShares}, Requested: ${shares}`
      );
    }

    // Set minimum payout to 95% of expected if not provided (5% slippage tolerance)
    const calculatedMinPayout = minPayout || shares * 0.95;

    // Call AMM contract to sell shares
    const sellResult = await ammService.sellShares({
      marketId,
      outcome,
      shares,
      minPayout: calculatedMinPayout,
    });

    // Verify slippage protection
    if (sellResult.payout < calculatedMinPayout) {
      throw new Error(
        `Slippage exceeded. Expected at least ${calculatedMinPayout} USDC, got ${sellResult.payout} USDC`
      );
    }

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Create trade record
      const trade = await tradeRepository.createSellTrade({
        userId,
        marketId,
        outcome,
        quantity: shares,
        pricePerUnit: sellResult.pricePerUnit,
        totalAmount: sellResult.payout,
        feeAmount: sellResult.feeAmount,
        txHash: sellResult.txHash,
      });

      // Confirm trade immediately (since blockchain transaction succeeded)
      await tradeRepository.confirmTrade(trade.id);

      // Update share position
      const updatedShare = await shareRepository.decrementShares(
        userShare.id,
        shares,
        sellResult.payout
      );

      // Credit USDC to user balance
      await tx.user.update({
        where: { id: userId },
        data: {
          usdcBalance: {
            increment: new Decimal(sellResult.payout),
          },
        },
      });

      // Update market volume
      await tx.market.update({
        where: { id: marketId },
        data: {
          totalVolume: {
            increment: new Decimal(sellResult.payout),
          },
        },
      });

      return {
        trade,
        share: updatedShare,
      };
    });

    return {
      sharesSold: shares,
      pricePerUnit: sellResult.pricePerUnit,
      payout: sellResult.payout,
      feeAmount: sellResult.feeAmount,
      txHash: sellResult.txHash,
      tradeId: result.trade.id,
      remainingShares: Number(result.share.quantity),
    };
  }

  /**
   * Get current market odds
   */
  async getMarketOdds(marketId: string): Promise<MarketOddsResult> {
    // Check if market exists
    const market = await prisma.market.findUnique({
      where: { id: marketId },
    });

    if (!market) {
      throw new Error('Market not found');
    }

    // Get odds from AMM contract
    const odds = await ammService.getOdds(marketId);

    return odds;
  }
}

export const tradingService = new TradingService();
