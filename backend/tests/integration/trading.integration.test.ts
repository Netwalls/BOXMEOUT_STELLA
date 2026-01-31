// backend/tests/integration/trading.integration.test.ts
// Integration tests for Trading API endpoints

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/index.js';
import { MarketStatus, TradeType, TradeStatus } from '@prisma/client';
import { ammService } from '../../src/services/blockchain/amm.js';

// Mock JWT verification
vi.mock('../../src/utils/jwt.js', () => ({
  verifyAccessToken: vi.fn().mockReturnValue({
    userId: 'test-user-id',
    publicKey: 'GTEST',
    tier: 'BEGINNER',
  }),
}));

// Mock AMM service
vi.mock('../../src/services/blockchain/amm.js', () => ({
  ammService: {
    buyShares: vi.fn(),
    sellShares: vi.fn(),
    getOdds: vi.fn(),
  },
}));

// Mock database
vi.mock('../../src/database/prisma.js', () => ({
  prisma: {
    market: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    share: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    trade: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback({
      user: {
        update: vi.fn().mockResolvedValue({ id: 'test-user-id', usdcBalance: 900 }),
      },
      market: {
        update: vi.fn().mockResolvedValue({ id: 'test-market-id' }),
      },
    })),
  },
}));

// Import after mocking
import { prisma } from '../../src/database/prisma.js';

describe('Trading API - Buy Shares', () => {
  let authToken: string;

  beforeAll(() => {
    authToken = 'mock-jwt-token';
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should buy shares successfully with valid data', async () => {
    // Mock market (OPEN)
    vi.mocked(prisma.market.findUnique).mockResolvedValue({
      id: 'test-market-id',
      contractAddress: 'contract',
      title: 'Test Market',
      status: MarketStatus.OPEN,
    } as any);

    // Mock user with sufficient balance
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'test-user-id',
      usdcBalance: 1000,
    } as any);

    // Mock AMM response
    vi.mocked(ammService.buyShares).mockResolvedValue({
      sharesReceived: 95,
      pricePerUnit: 1.05,
      totalCost: 100,
      feeAmount: 0.5,
      txHash: 'mock-tx-hash-buy',
    });

    // Mock no existing shares
    vi.mocked(prisma.share.findFirst).mockResolvedValue(null);

    // Mock share creation
    vi.mocked(prisma.share.create).mockResolvedValue({
      id: 'share-id',
      quantity: 95,
      costBasis: 100,
    } as any);

    // Mock trade creation
    vi.mocked(prisma.trade.create).mockResolvedValue({
      id: 'trade-id',
      tradeType: TradeType.BUY,
    } as any);

    vi.mocked(prisma.trade.update).mockResolvedValue({
      id: 'trade-id',
      status: TradeStatus.CONFIRMED,
    } as any);

    const response = await request(app)
      .post('/api/markets/test-market-id/buy')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        outcome: 1,
        amount: 100,
        minShares: 90,
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('sharesBought', 95);
    expect(response.body.data).toHaveProperty('pricePerUnit');
    expect(response.body.data).toHaveProperty('totalCost', 100);
    expect(response.body.data).toHaveProperty('txHash');
    expect(response.body.data).toHaveProperty('tradeId');

    // Verify AMM was called correctly
    expect(ammService.buyShares).toHaveBeenCalledWith({
      marketId: 'test-market-id',
      outcome: 1,
      amountUsdc: 100,
      minShares: 90,
    });
  });

  it('should reject buy with insufficient balance', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue({
      id: 'test-market-id',
      status: MarketStatus.OPEN,
    } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'test-user-id',
      usdcBalance: 50, // Less than requested amount
    } as any);

    const response = await request(app)
      .post('/api/markets/test-market-id/buy')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        outcome: 1,
        amount: 100,
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('BAD_REQUEST');
    expect(response.body.error.message).toContain('Insufficient balance');

    // AMM should not be called
    expect(ammService.buyShares).not.toHaveBeenCalled();
  });

  it('should reject buy with invalid market (CLOSED)', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue({
      id: 'test-market-id',
      status: MarketStatus.CLOSED,
    } as any);

    const response = await request(app)
      .post('/api/markets/test-market-id/buy')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        outcome: 1,
        amount: 100,
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.message).toContain('CLOSED');
    expect(ammService.buyShares).not.toHaveBeenCalled();
  });

  it('should reject buy with invalid outcome', async () => {
    const response = await request(app)
      .post('/api/markets/test-market-id/buy')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        outcome: 5, // Invalid outcome
        amount: 100,
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should handle slippage protection (minShares)', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue({
      id: 'test-market-id',
      status: MarketStatus.OPEN,
    } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'test-user-id',
      usdcBalance: 1000,
    } as any);

    // AMM returns less shares than minimum
    vi.mocked(ammService.buyShares).mockResolvedValue({
      sharesReceived: 85, // Less than minShares (90)
      pricePerUnit: 1.18,
      totalCost: 100,
      feeAmount: 0.5,
      txHash: 'mock-tx-hash',
    });

    const response = await request(app)
      .post('/api/markets/test-market-id/buy')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        outcome: 1,
        amount: 100,
        minShares: 90,
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('SLIPPAGE_EXCEEDED');
    expect(response.body.error.message).toContain('Slippage exceeded');
  });

  it('should record trade correctly in database', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue({
      id: 'test-market-id',
      status: MarketStatus.OPEN,
    } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'test-user-id',
      usdcBalance: 1000,
    } as any);

    vi.mocked(ammService.buyShares).mockResolvedValue({
      sharesReceived: 95,
      pricePerUnit: 1.05,
      totalCost: 100,
      feeAmount: 0.5,
      txHash: 'unique-tx-hash',
    });

    vi.mocked(prisma.share.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.share.create).mockResolvedValue({
      id: 'share-id',
      quantity: 95,
      costBasis: 100,
    } as any);

    vi.mocked(prisma.trade.create).mockResolvedValue({
      id: 'trade-id',
      txHash: 'unique-tx-hash',
    } as any);

    vi.mocked(prisma.trade.update).mockResolvedValue({
      id: 'trade-id',
      status: TradeStatus.CONFIRMED,
    } as any);

    await request(app)
      .post('/api/markets/test-market-id/buy')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        outcome: 1,
        amount: 100,
      })
      .expect(201);

    // Verify trade was created
    expect(prisma.trade.create).toHaveBeenCalled();
    
    // Verify trade was confirmed
    expect(prisma.trade.update).toHaveBeenCalledWith({
      where: { id: 'trade-id' },
      data: {
        status: TradeStatus.CONFIRMED,
        confirmedAt: expect.any(Date),
      },
    });
  });

  it('should update user balance correctly', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue({
      id: 'test-market-id',
      status: MarketStatus.OPEN,
    } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'test-user-id',
      usdcBalance: 1000,
    } as any);

    vi.mocked(ammService.buyShares).mockResolvedValue({
      sharesReceived: 95,
      pricePerUnit: 1.05,
      totalCost: 100,
      feeAmount: 0.5,
      txHash: 'mock-tx-hash',
    });

    vi.mocked(prisma.share.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.share.create).mockResolvedValue({
      id: 'share-id',
      quantity: 95,
      costBasis: 100,
    } as any);

    vi.mocked(prisma.trade.create).mockResolvedValue({
      id: 'trade-id',
    } as any);

    vi.mocked(prisma.trade.update).mockResolvedValue({
      id: 'trade-id',
      status: TradeStatus.CONFIRMED,
    } as any);

    await request(app)
      .post('/api/markets/test-market-id/buy')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        outcome: 1,
        amount: 100,
      })
      .expect(201);

    // Verify transaction was called
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('should create/update share position', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue({
      id: 'test-market-id',
      status: MarketStatus.OPEN,
    } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'test-user-id',
      usdcBalance: 1000,
    } as any);

    vi.mocked(ammService.buyShares).mockResolvedValue({
      sharesReceived: 95,
      pricePerUnit: 1.05,
      totalCost: 100,
      feeAmount: 0.5,
      txHash: 'mock-tx-hash',
    });

    // Mock existing share position
    vi.mocked(prisma.share.findFirst).mockResolvedValue({
      id: 'existing-share-id',
      quantity: 50,
      costBasis: 50,
    } as any);

    vi.mocked(prisma.share.findUnique).mockResolvedValue({
      id: 'existing-share-id',
      quantity: 50,
      costBasis: 50,
    } as any);

    vi.mocked(prisma.share.update).mockResolvedValue({
      id: 'existing-share-id',
      quantity: 145, // 50 + 95
      costBasis: 150, // 50 + 100
    } as any);

    vi.mocked(prisma.trade.create).mockResolvedValue({
      id: 'trade-id',
    } as any);

    vi.mocked(prisma.trade.update).mockResolvedValue({
      id: 'trade-id',
      status: TradeStatus.CONFIRMED,
    } as any);

    const response = await request(app)
      .post('/api/markets/test-market-id/buy')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        outcome: 1,
        amount: 100,
      })
      .expect(201);

    expect(response.body.data.position.totalShares).toBeGreaterThan(0);
  });
});

describe('Trading API - Sell Shares', () => {
  let authToken: string;

  beforeAll(() => {
    authToken = 'mock-jwt-token';
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should sell shares successfully with valid data', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue({
      id: 'test-market-id',
    } as any);

    // Mock user has shares
    vi.mocked(prisma.share.findFirst).mockResolvedValue({
      id: 'share-id',
      quantity: 100,
      costBasis: 100,
    } as any);

    vi.mocked(prisma.share.findUnique).mockResolvedValue({
      id: 'share-id',
      quantity: 100,
      costBasis: 100,
      soldQuantity: 0,
      realizedPnl: 0,
      entryPrice: 1,
    } as any);

    // Mock AMM response
    vi.mocked(ammService.sellShares).mockResolvedValue({
      payout: 52,
      pricePerUnit: 1.04,
      feeAmount: 0.26,
      txHash: 'mock-tx-hash-sell',
    });

    vi.mocked(prisma.share.update).mockResolvedValue({
      id: 'share-id',
      quantity: 50,
      costBasis: 50,
    } as any);

    vi.mocked(prisma.trade.create).mockResolvedValue({
      id: 'trade-id',
      tradeType: TradeType.SELL,
    } as any);

    vi.mocked(prisma.trade.update).mockResolvedValue({
      id: 'trade-id',
      status: TradeStatus.CONFIRMED,
    } as any);

    const response = await request(app)
      .post('/api/markets/test-market-id/sell')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        outcome: 1,
        shares: 50,
        minPayout: 48,
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('sharesSold', 50);
    expect(response.body.data).toHaveProperty('payout', 52);
    expect(response.body.data).toHaveProperty('txHash');

    expect(ammService.sellShares).toHaveBeenCalledWith({
      marketId: 'test-market-id',
      outcome: 1,
      shares: 50,
      minPayout: 48,
    });
  });

  it('should reject sell with insufficient shares', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue({
      id: 'test-market-id',
    } as any);

    vi.mocked(prisma.share.findFirst).mockResolvedValue({
      id: 'share-id',
      quantity: 30, // Less than requested
    } as any);

    const response = await request(app)
      .post('/api/markets/test-market-id/sell')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        outcome: 1,
        shares: 50,
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('BAD_REQUEST');
    expect(response.body.error.message).toContain('Insufficient shares');
    expect(ammService.sellShares).not.toHaveBeenCalled();
  });

  it('should reject sell when user has no shares', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue({
      id: 'test-market-id',
    } as any);

    vi.mocked(prisma.share.findFirst).mockResolvedValue(null);

    const response = await request(app)
      .post('/api/markets/test-market-id/sell')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        outcome: 1,
        shares: 50,
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.message).toContain('No shares found');
  });

  it('should handle slippage protection (minPayout)', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue({
      id: 'test-market-id',
    } as any);

    vi.mocked(prisma.share.findFirst).mockResolvedValue({
      id: 'share-id',
      quantity: 100,
    } as any);

    // AMM returns less payout than minimum
    vi.mocked(ammService.sellShares).mockResolvedValue({
      payout: 45, // Less than minPayout (50)
      pricePerUnit: 0.9,
      feeAmount: 0.5,
      txHash: 'mock-tx-hash',
    });

    const response = await request(app)
      .post('/api/markets/test-market-id/sell')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        outcome: 1,
        shares: 50,
        minPayout: 50,
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('SLIPPAGE_EXCEEDED');
  });

  it('should update share position correctly', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue({
      id: 'test-market-id',
    } as any);

    vi.mocked(prisma.share.findFirst).mockResolvedValue({
      id: 'share-id',
      quantity: 100,
      costBasis: 100,
    } as any);

    vi.mocked(prisma.share.findUnique).mockResolvedValue({
      id: 'share-id',
      quantity: 100,
      costBasis: 100,
      soldQuantity: 0,
      realizedPnl: 0,
      entryPrice: 1,
    } as any);

    vi.mocked(ammService.sellShares).mockResolvedValue({
      payout: 52,
      pricePerUnit: 1.04,
      feeAmount: 0.26,
      txHash: 'mock-tx-hash',
    });

    vi.mocked(prisma.share.update).mockResolvedValue({
      id: 'share-id',
      quantity: 50, // Reduced from 100
      costBasis: 50,
    } as any);

    vi.mocked(prisma.trade.create).mockResolvedValue({
      id: 'trade-id',
    } as any);

    vi.mocked(prisma.trade.update).mockResolvedValue({
      id: 'trade-id',
      status: TradeStatus.CONFIRMED,
    } as any);

    const response = await request(app)
      .post('/api/markets/test-market-id/sell')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        outcome: 1,
        shares: 50,
      })
      .expect(200);

    expect(response.body.data.remainingShares).toBe(50);
  });
});

describe('Trading API - Get Odds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return odds successfully', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue({
      id: 'test-market-id',
    } as any);

    vi.mocked(ammService.getOdds).mockResolvedValue({
      yesOdds: 0.65,
      noOdds: 0.35,
      yesPercentage: 65,
      noPercentage: 35,
      yesLiquidity: 650,
      noLiquidity: 350,
      totalLiquidity: 1000,
    });

    const response = await request(app)
      .get('/api/markets/test-market-id/odds')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.yes.percentage).toBe(65);
    expect(response.body.data.no.percentage).toBe(35);
    expect(response.body.data.totalLiquidity).toBe(1000);
  });

  it('should return percentages adding to 100%', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue({
      id: 'test-market-id',
    } as any);

    vi.mocked(ammService.getOdds).mockResolvedValue({
      yesOdds: 0.72,
      noOdds: 0.28,
      yesPercentage: 72,
      noPercentage: 28,
      yesLiquidity: 720,
      noLiquidity: 280,
      totalLiquidity: 1000,
    });

    const response = await request(app)
      .get('/api/markets/test-market-id/odds')
      .expect(200);

    const yesPercent = response.body.data.yes.percentage;
    const noPercent = response.body.data.no.percentage;

    expect(yesPercent + noPercent).toBe(100);
  });

  it('should handle market not found', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(null);

    const response = await request(app)
      .get('/api/markets/nonexistent-market/odds')
      .expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('should include liquidity information', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue({
      id: 'test-market-id',
    } as any);

    vi.mocked(ammService.getOdds).mockResolvedValue({
      yesOdds: 0.55,
      noOdds: 0.45,
      yesPercentage: 55,
      noPercentage: 45,
      yesLiquidity: 5500,
      noLiquidity: 4500,
      totalLiquidity: 10000,
    });

    const response = await request(app)
      .get('/api/markets/test-market-id/odds')
      .expect(200);

    expect(response.body.data.yes.liquidity).toBe(5500);
    expect(response.body.data.no.liquidity).toBe(4500);
    expect(response.body.data.totalLiquidity).toBe(10000);
  });
});
