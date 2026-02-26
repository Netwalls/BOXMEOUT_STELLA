// backend/tests/integration/market-lifecycle.service.integration.test.ts
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest';
import {
  PrismaClient,
  MarketStatus,
  TradeType,
  TradeStatus,
  PredictionStatus,
} from '@prisma/client';
import { MarketService } from '../../src/services/market.service.js';
import { TradingService } from '../../src/services/trading.service.js';
import { PredictionService } from '../../src/services/prediction.service.js';
import { ammService } from '../../src/services/blockchain/amm.js';
import { factoryService } from '../../src/services/blockchain/factory.js';
import { prisma } from '../../src/database/prisma.js';

// Mock blockchain services
vi.mock('../../src/services/blockchain/amm.js', () => ({
  ammService: {
    createPool: vi.fn(),
    buyShares: vi.fn(),
    sellShares: vi.fn(),
    getOdds: vi.fn(),
    getPoolState: vi.fn(),
  },
}));

vi.mock('../../src/services/blockchain/factory.js', () => ({
  factoryService: {
    createMarket: vi.fn(),
    getMarketCount: vi.fn(),
  },
}));

describe('Market Lifecycle Service Integration', () => {
  let marketService: MarketService;
  let tradingService: TradingService;
  let predictionService: PredictionService;

  let testUser: any;
  let testMarket: any;

  beforeAll(async () => {
    marketService = new MarketService();
    tradingService = new TradingService();
    predictionService = new PredictionService();

    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: `lifecycle-${Date.now()}@test.com`,
        username: `lifecycle_user_${Date.now()}`,
        passwordHash: 'hash',
        walletAddress:
          'GTEST' +
          Math.random().toString(36).substring(2, 15).toUpperCase() +
          'X'.repeat(40),
        usdcBalance: 10000,
        xlmBalance: 1000,
      },
    });
  });

  afterAll(async () => {
    if (testMarket) {
      // Need to delete related entities first
      await prisma.trade.deleteMany({ where: { marketId: testMarket.id } });
      await prisma.prediction.deleteMany({
        where: { marketId: testMarket.id },
      });
      await prisma.share.deleteMany({ where: { marketId: testMarket.id } });
      await prisma.market.delete({ where: { id: testMarket.id } });
    }
    if (testUser) {
      await prisma.user.delete({ where: { id: testUser.id } });
    }
  });

  it('should complete full market lifecycle using services', async () => {
    // 1. Create Market
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const mockMarketId = '0x' + '1'.repeat(64);

    vi.mocked(factoryService.createMarket).mockResolvedValue({
      marketId: mockMarketId,
      txHash: 'factory-tx-hash',
      contractAddress: 'factory-address',
    });

    testMarket = await marketService.createMarket({
      title: 'Integration Test Market',
      description: 'Full lifecycle test market',
      category: 'WRESTLING',
      creatorId: testUser.id,
      creatorPublicKey: testUser.walletAddress,
      outcomeA: 'YES',
      outcomeB: 'NO',
      closingAt: futureDate,
    });

    expect(testMarket.status).toBe(MarketStatus.OPEN);
    expect(testMarket.contractAddress).toBe(mockMarketId);

    // 2. Initialize Pool
    const poolLiquidity = 1000000000n; // 1000 USDC in stroops (assuming 6 decimals)

    vi.mocked(ammService.createPool).mockResolvedValue({
      txHash: 'pool-tx-hash',
      reserves: { yes: 500000000n, no: 500000000n },
      odds: { yes: 0.5, no: 0.5 },
    });

    const poolResult = await marketService.createPool(
      testMarket.id,
      poolLiquidity
    );

    expect(poolResult.txHash).toBe('pool-tx-hash');
    expect(poolResult.reserves.yes).toBe(500); // 500.000000
    expect(poolResult.reserves.no).toBe(500);

    const marketAfterPool = await prisma.market.findUnique({
      where: { id: testMarket.id },
    });
    expect(Number(marketAfterPool?.yesLiquidity)).toBe(500);

    // 3. Trade (Buy YES shares)
    const buyAmount = 100;
    vi.mocked(ammService.buyShares).mockResolvedValue({
      sharesReceived: 100,
      pricePerUnit: 1.0,
      totalCost: 100,
      feeAmount: 1,
      txHash: 'buy-tx-hash',
    });

    const buyResult = await tradingService.buyShares({
      userId: testUser.id,
      marketId: testMarket.id,
      outcome: 1, // YES
      amount: buyAmount,
    });

    expect(buyResult.sharesBought).toBe(100);
    expect(buyResult.txHash).toBe('buy-tx-hash');

    const userAfterBuy = await prisma.user.findUnique({
      where: { id: testUser.id },
    });
    expect(Number(userAfterBuy?.usdcBalance)).toBe(10000 - 100); // Only totalCost is deducted in current implementation

    // 4. Prediction (Commit and Reveal)
    const predictionAmount = 50;
    const prediction = await predictionService.commitPrediction(
      testUser.id,
      testMarket.id,
      1, // YES
      predictionAmount
    );

    expect(prediction.status).toBe(PredictionStatus.COMMITTED);
    expect(Number(prediction.amountUsdc)).toBe(50);

    const userAfterCommit = await prisma.user.findUnique({
      where: { id: testUser.id },
    });
    expect(Number(userAfterCommit?.usdcBalance)).toBe(
      Number(userAfterBuy?.usdcBalance) - predictionAmount
    );

    // Reveal prediction (usually happens before closing, but let's test the flow)
    const revealedPrediction = await predictionService.revealPrediction(
      testUser.id,
      prediction.id,
      testMarket.id
    );
    expect(revealedPrediction.status).toBe(PredictionStatus.REVEALED);

    // 5. Close Market
    const closedMarket = await marketService.closeMarket(testMarket.id);
    expect(closedMarket.status).toBe(MarketStatus.CLOSED);

    // 6. Resolve Market (YES wins)
    const resolvedMarket = await marketService.resolveMarket(
      testMarket.id,
      1, // YES wins
      'manual-integration-test'
    );

    expect(resolvedMarket.status).toBe(MarketStatus.RESOLVED);
    expect(resolvedMarket.winningOutcome).toBe(1);

    // 7. Settle Predictions (already handled by resolveMarket internally)
    const settledPrediction = await prisma.prediction.findUnique({
      where: { id: prediction.id },
    });
    expect(settledPrediction?.status).toBe(PredictionStatus.SETTLED);
    expect(settledPrediction?.isWinner).toBe(true);
    expect(Number(settledPrediction?.pnlUsd)).toBeGreaterThan(0);

    // 8. Claim Winnings
    const balanceBeforeClaim = (
      await prisma.user.findUnique({ where: { id: testUser.id } })
    )?.usdcBalance;

    const claimResult = await predictionService.claimWinnings(
      testUser.id,
      prediction.id
    );
    expect(claimResult.winnings).toBeGreaterThan(0);

    const finalUser = await prisma.user.findUnique({
      where: { id: testUser.id },
    });
    expect(Number(finalUser?.usdcBalance)).toBe(
      Number(balanceBeforeClaim) + claimResult.winnings
    );

    // Final state checks
    const finalMarket = await prisma.market.findUnique({
      where: { id: testMarket.id },
      include: {
        trades: true,
        predictions: true,
      },
    });

    expect(finalMarket?.trades.length).toBe(1);
    expect(finalMarket?.predictions.length).toBe(1);
    expect(finalMarket?.status).toBe(MarketStatus.RESOLVED);
  });
});
