// backend/tests/services/trading.service.test.ts
// Unit tests for TradingService.sellShares()
// All external dependencies (ammService, prisma, repositories) are fully mocked.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarketStatus } from '@prisma/client';

// ─── vi.hoisted: declare mocks before any module is loaded ───────────────────
// ESM hoists vi.mock() factories, so any variables they reference must be
// created with vi.hoisted() to guarantee initialization order.
const { mockCreateSellTrade, mockConfirmTrade } = vi.hoisted(() => ({
  mockCreateSellTrade: vi.fn(),
  mockConfirmTrade: vi.fn(),
}));

// ─── Mock: Trade repository class ────────────────────────────────────────────
vi.mock('../../src/repositories/trade.repository.js', () => ({
  TradeRepository: vi.fn().mockImplementation(() => ({
    createSellTrade: mockCreateSellTrade,
    createBuyTrade: vi.fn(),
    confirmTrade: mockConfirmTrade,
  })),
}));

// ─── Mock: AMM blockchain service ────────────────────────────────────────────
vi.mock('../../src/services/blockchain/amm.js', () => ({
  ammService: {
    sellShares: vi.fn(),
    buyShares: vi.fn(),
    getOdds: vi.fn(),
    buildSellSharesTx: vi.fn(),
    buildBuySharesTx: vi.fn(),
    submitSignedTx: vi.fn(),
    addLiquidity: vi.fn(),
    removeLiquidity: vi.fn(),
  },
}));

// ─── Mock: Share repository ───────────────────────────────────────────────────
vi.mock('../../src/repositories/share.repository.js', () => ({
  shareRepository: {
    findByUserMarketOutcome: vi.fn(),
    decrementShares: vi.fn(),
    incrementShares: vi.fn(),
    createPosition: vi.fn(),
  },
}));

// ─── Mock: Prisma client ──────────────────────────────────────────────────────
vi.mock('../../src/database/prisma.js', () => ({
  prisma: {
    market: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

// Import after mocking so stubs are in place
import { TradingService } from '../../src/services/trading.service.js';
import { ammService } from '../../src/services/blockchain/amm.js';
import { shareRepository } from '../../src/repositories/share.repository.js';
import { prisma } from '../../src/database/prisma.js';
import { ApiError } from '../../src/middleware/error.middleware.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_MARKET = { id: 'market-1', status: MarketStatus.OPEN };

const MOCK_SHARE = {
  id: 'share-1',
  quantity: 100,
  costBasis: 100,
  entryPrice: 1,
  soldQuantity: 0,
  realizedPnl: 0,
};

const MOCK_AMM_SELL_RESULT = {
  payout: 52,
  pricePerUnit: 1.04,
  feeAmount: 0.26,
  txHash: 'tx-hash-sell-001',
};

const MOCK_TRADE = { id: 'trade-1' };
const MOCK_UPDATED_SHARE = { id: 'share-1', quantity: 50 };

// Helper: default $transaction mock that forwards to callback with tx client
function makeTxClient() {
  return {
    user: {
      update: vi.fn().mockResolvedValue({ id: 'user-1', usdcBalance: 1052 }),
    },
    market: {
      update: vi.fn().mockResolvedValue(MOCK_MARKET),
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TradingService.sellShares()', () => {
  let service: TradingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TradingService();

    // Default happy-path mocks
    vi.mocked(prisma.market.findUnique).mockResolvedValue(MOCK_MARKET as any);
    vi.mocked(shareRepository.findByUserMarketOutcome).mockResolvedValue(
      MOCK_SHARE as any
    );
    vi.mocked(ammService.sellShares).mockResolvedValue(MOCK_AMM_SELL_RESULT);
    mockCreateSellTrade.mockResolvedValue(MOCK_TRADE as any);
    mockConfirmTrade.mockResolvedValue({ ...MOCK_TRADE, status: 'CONFIRMED' });
    vi.mocked(shareRepository.decrementShares).mockResolvedValue(
      MOCK_UPDATED_SHARE as any
    );

    // Default $transaction passes through to the callback
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) =>
      callback(makeTxClient())
    );
  });

  // ── 1: Happy path ───────────────────────────────────────────────────────────
  it('should sell shares successfully and return correct result', async () => {
    const result = await service.sellShares({
      userId: 'user-1',
      marketId: 'market-1',
      outcome: 1,
      shares: 50,
      minPayout: 48,
    });

    expect(result.sharesSold).toBe(50);
    expect(result.payout).toBe(52);
    expect(result.pricePerUnit).toBe(1.04);
    expect(result.feeAmount).toBe(0.26);
    expect(result.txHash).toBe('tx-hash-sell-001');
    expect(result.tradeId).toBe('trade-1');
    expect(result.remainingShares).toBe(50);
  });

  // ── 2: Invalid outcome ──────────────────────────────────────────────────────
  it('should throw when outcome is not 0 or 1', async () => {
    await expect(
      service.sellShares({ userId: 'u', marketId: 'm', outcome: 2, shares: 10 })
    ).rejects.toThrow('Invalid outcome. Must be 0 (NO) or 1 (YES)');
  });

  // ── 3: shares = 0 ──────────────────────────────────────────────────────────
  it('should throw when shares is zero', async () => {
    await expect(
      service.sellShares({ userId: 'u', marketId: 'm', outcome: 1, shares: 0 })
    ).rejects.toThrow('Shares must be greater than 0');
  });

  // ── 4: shares < 0 ──────────────────────────────────────────────────────────
  it('should throw when shares is negative', async () => {
    await expect(
      service.sellShares({ userId: 'u', marketId: 'm', outcome: 1, shares: -5 })
    ).rejects.toThrow('Shares must be greater than 0');
  });

  // ── 5: Market not found ─────────────────────────────────────────────────────
  it('should throw when market does not exist', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(null);
    await expect(
      service.sellShares({
        userId: 'u',
        marketId: 'bad-market',
        outcome: 1,
        shares: 10,
      })
    ).rejects.toThrow('Market not found');
  });

  // ── 6: No share position (outcome YES) ─────────────────────────────────────
  it('should throw with YES label when user has no shares for outcome 1', async () => {
    vi.mocked(shareRepository.findByUserMarketOutcome).mockResolvedValue(null);
    await expect(
      service.sellShares({
        userId: 'u',
        marketId: 'market-1',
        outcome: 1,
        shares: 10,
      })
    ).rejects.toThrow('No shares found for outcome YES');
  });

  // ── 7: No share position (outcome NO) ──────────────────────────────────────
  it('should throw with NO label when user has no shares for outcome 0', async () => {
    vi.mocked(shareRepository.findByUserMarketOutcome).mockResolvedValue(null);
    await expect(
      service.sellShares({
        userId: 'u',
        marketId: 'market-1',
        outcome: 0,
        shares: 10,
      })
    ).rejects.toThrow('No shares found for outcome NO');
  });

  // ── 8: Insufficient shares ──────────────────────────────────────────────────
  it('should throw when selling more shares than owned', async () => {
    vi.mocked(shareRepository.findByUserMarketOutcome).mockResolvedValue({
      ...MOCK_SHARE,
      quantity: 30,
    } as any);
    await expect(
      service.sellShares({
        userId: 'u',
        marketId: 'market-1',
        outcome: 1,
        shares: 50,
      })
    ).rejects.toThrow('Insufficient shares. Available: 30, Requested: 50');
  });

  // ── 9: Slippage exceeded ────────────────────────────────────────────────────
  it('should throw ApiError 400 SLIPPAGE_EXCEEDED when payout < minPayout', async () => {
    vi.mocked(ammService.sellShares).mockResolvedValue({
      payout: 40, // below minPayout of 48
      pricePerUnit: 0.8,
      feeAmount: 0.2,
      txHash: 'tx-slip',
    });

    const err = await service
      .sellShares({
        userId: 'user-1',
        marketId: 'market-1',
        outcome: 1,
        shares: 50,
        minPayout: 48,
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).statusCode).toBe(400);
    expect((err as ApiError).code).toBe('SLIPPAGE_EXCEEDED');
  });

  // ── 10: AMM called with correct params ─────────────────────────────────────
  it('should call ammService.sellShares with the exact parameters', async () => {
    // Payout must exceed minPayout (70) to avoid slippage error
    vi.mocked(ammService.sellShares).mockResolvedValue({
      ...MOCK_AMM_SELL_RESULT,
      payout: 72,
    });

    await service.sellShares({
      userId: 'user-1',
      marketId: 'market-1',
      outcome: 0,
      shares: 75,
      minPayout: 70,
    });

    expect(ammService.sellShares).toHaveBeenCalledOnce();
    expect(ammService.sellShares).toHaveBeenCalledWith({
      marketId: 'market-1',
      outcome: 0,
      shares: 75,
      minPayout: 70,
    });
  });

  // ── 11: USDC credited to user ───────────────────────────────────────────────
  it('should increment the user USDC balance by the payout amount', async () => {
    let txUserUpdate: ReturnType<typeof vi.fn> | undefined;

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = makeTxClient();
      txUserUpdate = tx.user.update;
      return callback(tx);
    });

    await service.sellShares({
      userId: 'user-1',
      marketId: 'market-1',
      outcome: 1,
      shares: 50,
      minPayout: 48,
    });

    expect(txUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          usdcBalance: expect.objectContaining({
            increment: expect.anything(),
          }),
        }),
      })
    );
  });

  // ── 12: Default minPayout = 95% of shares ──────────────────────────────────
  it('should default minPayout to 95% of shares when not provided', async () => {
    // Payout must exceed default minPayout (100 * 0.95 = 95) to avoid slippage error
    vi.mocked(ammService.sellShares).mockResolvedValue({
      ...MOCK_AMM_SELL_RESULT,
      payout: 97,
    });

    await service.sellShares({
      userId: 'user-1',
      marketId: 'market-1',
      outcome: 1,
      shares: 100,
      // minPayout omitted → 100 * 0.95 = 95
    });

    expect(ammService.sellShares).toHaveBeenCalledWith(
      expect.objectContaining({ minPayout: 95 })
    );
  });

  // ── 13: Share position decremented ─────────────────────────────────────────
  it('should call shareRepository.decrementShares with the correct args', async () => {
    await service.sellShares({
      userId: 'user-1',
      marketId: 'market-1',
      outcome: 1,
      shares: 50,
      minPayout: 48,
    });

    expect(shareRepository.decrementShares).toHaveBeenCalledOnce();
    expect(shareRepository.decrementShares).toHaveBeenCalledWith(
      'share-1', // shareId
      50, // quantityToSell
      52 // proceeds (payout from AMM)
    );
  });
});
