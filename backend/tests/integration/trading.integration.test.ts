// backend/tests/integration/trading.integration.test.ts
// Integration tests for Trading API endpoints (both direct and user-signed flow)

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest';
import request from 'supertest';
import app from '../../src/index.js';
import { MarketStatus, TradeType, TradeStatus } from '@prisma/client';
import { ammService } from '../../src/services/blockchain/amm.js';

// Mock JWT verification
vi.mock('../../src/utils/jwt.js', () => ({
  verifyAccessToken: vi.fn().mockReturnValue({
    userId: 'test-user-id',
    publicKey: 'GUSER123',
    tier: 'BEGINNER',
  }),
}));

// Mock AMM service
vi.mock('../../src/services/blockchain/amm.js', () => ({
  ammService: {
    buyShares: vi.fn(),
    sellShares: vi.fn(),
    getOdds: vi.fn(),
    addLiquidity: vi.fn(),
    removeLiquidity: vi.fn(),
    buildBuySharesTx: vi.fn(),
    buildSellSharesTx: vi.fn(),
    submitSignedTx: vi.fn(),
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
    $transaction: vi.fn((callback) =>
      callback({
        user: {
          update: vi
            .fn()
            .mockResolvedValue({ id: 'test-user-id', usdcBalance: 900 }),
        },
        market: {
          update: vi.fn().mockResolvedValue({ id: 'test-market-id' }),
        },
      })
    ),
  },
}));

// Import after mocking
import { prisma } from '../../src/database/prisma.js';

describe('Trading API - User-Signed Transaction Flow', () => {
  const authToken = 'valid-token';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/markets/:marketId/build-tx/buy', () => {
    it('should return unsigned XDR for a valid market', async () => {
      // Mock market
      vi.mocked(prisma.market.findUnique).mockResolvedValue({
        id: 'market-1',
        status: MarketStatus.OPEN,
      } as any);

      // Mock AMM response
      vi.mocked(ammService.buildBuySharesTx).mockResolvedValue(
        'AAAA-UNSIGNED-XDR'
      );

      const response = await request(app)
        .post('/api/markets/market-1/build-tx/buy')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          outcome: 1,
          amount: '1000',
          minShares: '900',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.xdr).toBe('AAAA-UNSIGNED-XDR');

      // Verify it called AMM with the user's public key from the JWT
      expect(ammService.buildBuySharesTx).toHaveBeenCalledWith('GUSER123', {
        marketId: 'market-1',
        outcome: 1,
        amountUsdc: BigInt(1000),
        minShares: BigInt(900),
      });
    });

    it('should fail if market is not OPEN', async () => {
      vi.mocked(prisma.market.findUnique).mockResolvedValue({
        id: 'market-1',
        status: MarketStatus.CLOSED,
      } as any);

      const response = await request(app)
        .post('/api/markets/market-1/build-tx/buy')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          outcome: 1,
          amount: '1000',
        });

      expect(response.status).toBe(500); // Controller catches the error and returns 500
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('CLOSED');
    });
  });

  describe('POST /api/submit-signed-tx', () => {
    it('should submit a signed XDR and return result', async () => {
      vi.mocked(ammService.submitSignedTx).mockResolvedValue({
        txHash: 'tx-123',
        status: 'SUCCESS',
      });

      const response = await request(app)
        .post('/api/submit-signed-tx')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          signedXdr: 'AAAA-SIGNED-XDR',
          action: 'BUY',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.txHash).toBe('tx-123');

      // Verify it passes the user's public key from the JWT for validation
      expect(ammService.submitSignedTx).toHaveBeenCalledWith(
        'AAAA-SIGNED-XDR',
        'GUSER123',
        'BUY'
      );
    });

    it('should reject if signedXdr is missing', async () => {
      const response = await request(app)
        .post('/api/submit-signed-tx')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ action: 'BUY' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});

describe('Trading API - Direct Buy Flow', () => {
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
});

describe('Trading API - Direct Sell Flow', () => {
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
});

describe('Trading API - Odds & Liquidity', () => {
  let authToken: string;

  beforeAll(() => {
    authToken = 'mock-jwt-token';
  });

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

  it('should add liquidity successfully', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue({
      id: 'test-market-id',
      status: MarketStatus.OPEN,
    } as any);

    vi.mocked(ammService.addLiquidity).mockResolvedValue({
      lpTokensMinted: BigInt(500),
      txHash: 'mock-tx-hash-add-liquidity',
    });

    const response = await request(app)
      .post('/api/markets/test-market-id/liquidity/add')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ usdcAmount: '1000' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('lpTokensMinted', '500');
    expect(response.body.data).toHaveProperty(
      'txHash',
      'mock-tx-hash-add-liquidity'
    );
  });

  it('should remove liquidity successfully', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue({
      id: 'test-market-id',
      status: MarketStatus.OPEN,
    } as any);

    vi.mocked(ammService.removeLiquidity).mockResolvedValue({
      yesAmount: BigInt(250),
      noAmount: BigInt(250),
      totalUsdcReturned: BigInt(500),
      txHash: 'mock-tx-hash-remove-liquidity',
    });

    const response = await request(app)
      .post('/api/markets/test-market-id/liquidity/remove')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ lpTokens: '500' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('yesAmount', '250');
    expect(response.body.data).toHaveProperty('noAmount', '250');
    expect(response.body.data).toHaveProperty('totalUsdcReturned', '500');
  });
});
