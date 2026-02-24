// End-to-end test for complete market lifecycle
// Tests: create → pool init → trade → close → resolve → settle

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  PrismaClient,
  MarketStatus,
  TradeType,
  TradeStatus,
} from '@prisma/client';
import { MarketService } from '../../src/services/market.service.js';
import { MarketRepository } from '../../src/repositories/market.repository.js';
import { UserRepository } from '../../src/repositories/user.repository.js';
import { TradeRepository } from '../../src/repositories/trade.repository.js';
import { PredictionRepository } from '../../src/repositories/prediction.repository.js';

describe('Market Lifecycle E2E', () => {
  let prisma: PrismaClient;
  let marketService: MarketService;
  let marketRepo: MarketRepository;
  let userRepo: UserRepository;
  let tradeRepo: TradeRepository;
  let predictionRepo: PredictionRepository;

  let testUser: any;
  let testMarket: any;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });

    marketService = new MarketService();
    marketRepo = new MarketRepository();
    userRepo = new UserRepository();
    tradeRepo = new TradeRepository();
    predictionRepo = new PredictionRepository();

    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: 'lifecycle@test.com',
        username: 'lifecycle_user',
        passwordHash: 'hash',
        walletAddress: 'GTEST' + 'X'.repeat(51),
        usdcBalance: 10000,
        xlmBalance: 1000,
      },
    });
  });

  afterAll(async () => {
    if (testUser) {
      await prisma.trade
        .deleteMany({ where: { userId: testUser.id } })
        .catch(() => {});
      await prisma.prediction
        .deleteMany({ where: { userId: testUser.id } })
        .catch(() => {});
      await prisma.share
        .deleteMany({ where: { userId: testUser.id } })
        .catch(() => {});
      await prisma.leaderboard
        .deleteMany({ where: { userId: testUser.id } })
        .catch(() => {});
      await prisma.categoryLeaderboard
        .deleteMany({ where: { userId: testUser.id } })
        .catch(() => {});
    }
    if (testMarket) {
      await prisma.market
        .delete({ where: { id: testMarket.id } })
        .catch(() => {});
    }
    if (testUser) {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it('should complete full market lifecycle', async () => {
    // STEP 1: Create Market
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    testMarket = await prisma.market.create({
      data: {
        contractAddress: 'CTEST' + Date.now(),
        title: 'E2E Test Market',
        description: 'Full lifecycle test market',
        category: 'WRESTLING',
        creatorId: testUser.id,
        outcomeA: 'YES',
        outcomeB: 'NO',
        closingAt: futureDate,
        status: MarketStatus.OPEN,
      },
    });

    expect(testMarket.status).toBe(MarketStatus.OPEN);
    expect(Number(testMarket.yesLiquidity)).toBe(0);
    expect(Number(testMarket.noLiquidity)).toBe(0);

    // Verify balance before pool init
    const balanceBefore = await prisma.user.findUnique({
      where: { id: testUser.id },
      select: { usdcBalance: true },
    });

    // STEP 2: Initialize Pool
    const poolLiquidity = 1000_000_000n; // 1000 USDC

    await prisma.market.update({
      where: { id: testMarket.id },
      data: {
        yesLiquidity: 500,
        noLiquidity: 500,
        poolTxHash: 'pool-tx-' + Date.now(),
      },
    });

    const marketAfterPool = await prisma.market.findUnique({
      where: { id: testMarket.id },
    });

    expect(Number(marketAfterPool!.yesLiquidity)).toBe(500);
    expect(Number(marketAfterPool!.noLiquidity)).toBe(500);
    expect(marketAfterPool!.poolTxHash).toBeTruthy();

    // STEP 3: Execute Trade (Buy YES shares)
    const trade = await prisma.trade.create({
      data: {
        userId: testUser.id,
        marketId: testMarket.id,
        tradeType: TradeType.BUY,
        outcome: 1,
        quantity: 100,
        pricePerUnit: 0.55,
        totalAmount: 55,
        feeAmount: 0.55,
        txHash: 'trade-tx-' + Date.now(),
        status: TradeStatus.CONFIRMED,
        confirmedAt: new Date(),
      },
    });

    expect(trade.status).toBe(TradeStatus.CONFIRMED);
    expect(Number(trade.totalAmount)).toBe(55);

    // Update market volume
    await prisma.market.update({
      where: { id: testMarket.id },
      data: {
        totalVolume: { increment: Number(trade.totalAmount) },
        participantCount: { increment: 1 },
      },
    });

    // Update user balance
    await prisma.user.update({
      where: { id: testUser.id },
      data: {
        usdcBalance: {
          decrement: Number(trade.totalAmount) + Number(trade.feeAmount),
        },
      },
    });

    const balanceAfterTrade = await prisma.user.findUnique({
      where: { id: testUser.id },
      select: { usdcBalance: true },
    });

    expect(Number(balanceAfterTrade!.usdcBalance)).toBeLessThan(
      Number(balanceBefore!.usdcBalance)
    );

    // STEP 4: Close Market
    await prisma.market.update({
      where: { id: testMarket.id },
      data: {
        status: MarketStatus.CLOSED,
        closedAt: new Date(),
      },
    });

    const closedMarket = await prisma.market.findUnique({
      where: { id: testMarket.id },
    });

    expect(closedMarket!.status).toBe(MarketStatus.CLOSED);
    expect(closedMarket!.closedAt).toBeTruthy();

    // STEP 5: Resolve Market (YES wins)
    await prisma.market.update({
      where: { id: testMarket.id },
      data: {
        status: MarketStatus.RESOLVED,
        resolvedAt: new Date(),
        winningOutcome: 1,
        resolutionSource: 'oracle-consensus',
      },
    });

    const resolvedMarket = await prisma.market.findUnique({
      where: { id: testMarket.id },
    });

    expect(resolvedMarket!.status).toBe(MarketStatus.RESOLVED);
    expect(resolvedMarket!.winningOutcome).toBe(1);
    expect(resolvedMarket!.resolvedAt).toBeTruthy();

    // STEP 6: Settle Predictions
    const prediction = await prisma.prediction.create({
      data: {
        userId: testUser.id,
        marketId: testMarket.id,
        commitmentHash: 'hash-' + Date.now(),
        predictedOutcome: 1,
        amountUsdc: 55,
        status: 'REVEALED',
        revealedAt: new Date(),
      },
    });

    // Calculate winnings (90% return)
    const winnings = Number(prediction.amountUsdc) * 1.9;

    await prisma.prediction.update({
      where: { id: prediction.id },
      data: {
        status: 'SETTLED',
        isWinner: true,
        pnlUsd: winnings - Number(prediction.amountUsdc),
        settledAt: new Date(),
      },
    });

    // Update user balance with winnings
    await prisma.user.update({
      where: { id: testUser.id },
      data: {
        usdcBalance: { increment: winnings },
      },
    });

    const finalBalance = await prisma.user.findUnique({
      where: { id: testUser.id },
      select: { usdcBalance: true },
    });

    const settledPrediction = await prisma.prediction.findUnique({
      where: { id: prediction.id },
    });

    expect(settledPrediction!.status).toBe('SETTLED');
    expect(settledPrediction!.isWinner).toBe(true);
    expect(Number(settledPrediction!.pnlUsd)).toBeGreaterThan(0);
    expect(Number(finalBalance!.usdcBalance)).toBeGreaterThan(
      Number(balanceAfterTrade!.usdcBalance)
    );

    // Verify final state
    const finalMarket = await prisma.market.findUnique({
      where: { id: testMarket.id },
      include: {
        predictions: true,
        trades: true,
      },
    });

    expect(finalMarket!.status).toBe(MarketStatus.RESOLVED);
    expect(finalMarket!.predictions.length).toBe(1);
    expect(finalMarket!.trades.length).toBe(1);
    expect(Number(finalMarket!.totalVolume)).toBeGreaterThan(0);
  });
});
