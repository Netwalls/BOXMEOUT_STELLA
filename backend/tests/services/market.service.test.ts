// Unit tests for MarketService PnL calculations
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MarketService } from '../../src/services/market.service.js';
import { PredictionRepository } from '../../src/repositories/prediction.repository.js';
import { TradeRepository } from '../../src/repositories/trade.repository.js';
import { MarketRepository } from '../../src/repositories/market.repository.js';
import { executeTransaction } from '../../src/database/transaction.js';

// Mock dependencies
vi.mock('../../src/repositories/prediction.repository.js');
vi.mock('../../src/repositories/trade.repository.js');
vi.mock('../../src/repositories/market.repository.js');
vi.mock('../../src/database/transaction.js');
vi.mock('../../src/services/blockchain/factory.js');
vi.mock('../../src/services/blockchain/amm.js');

describe('MarketService - settlePredictions PnL Calculation', () => {
  let marketService: MarketService;
  let mockPredictionRepo: any;
  let mockTradeRepo: any;
  let mockMarketRepo: any;

  const marketId = 'test-market-id';
  const userId1 = 'user-1';
  const userId2 = 'user-2';

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset environment variable
    delete process.env.PLATFORM_FEE_PERCENTAGE;

    // Setup mock repositories
    mockPredictionRepo = {
      findMarketPredictions: vi.fn(),
      settlePrediction: vi.fn(),
    };

    mockTradeRepo = {
      findByUserAndMarket: vi.fn(),
    };

    mockMarketRepo = {
      findById: vi.fn(),
      updateMarketStatus: vi.fn(),
    };

    // Mock the repository constructors to return our mocks
    vi.mocked(PredictionRepository).mockImplementation(() => mockPredictionRepo as any);
    vi.mocked(TradeRepository).mockImplementation(() => mockTradeRepo as any);
    vi.mocked(MarketRepository).mockImplementation(() => mockMarketRepo as any);

    // Mock executeTransaction to call the callback immediately
    vi.mocked(executeTransaction).mockImplementation(async (callback: any) => {
      const tx = {
        market: {
          findUnique: vi.fn().mockResolvedValue({
            yesLiquidity: 500,
            noLiquidity: 500,
          }),
        },
      };
      return await callback(tx);
    });

    // Create service after mocks are set up
    marketService = new MarketService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('PnL calculation based on actual AMM odds', () => {
    it('should calculate PnL using actual entry price from trade data', async () => {
      const predictions = [
        {
          id: 'pred-1', userId: userId1, marketId,
          predictedOutcome: 1, amountUsdc: 65, status: 'REVEALED',
        },
        {
          id: 'pred-dummy', userId: 'dummy-user', marketId,
          predictedOutcome: 0, amountUsdc: 50, status: 'REVEALED',
        },
      ];

      const userTrades = [{
        id: 'trade-1', userId: userId1, marketId, tradeType: 'BUY',
        outcome: 1, quantity: 100, pricePerUnit: 0.65,
        totalAmount: 65, feeAmount: 0.65, status: 'CONFIRMED',
      }];

      mockPredictionRepo.findMarketPredictions.mockResolvedValue(predictions);
      mockTradeRepo.findByUserAndMarket
        .mockResolvedValueOnce(userTrades)
        .mockResolvedValueOnce([]);

      await (marketService as any).settlePredictions(marketId, 1);

      // 100 shares * 1 USDC = 100 gross, 100 * 0.98 = 98 net, PnL = 98 - 65 = 33
      expect(mockPredictionRepo.settlePrediction).toHaveBeenCalledWith('pred-1', true, expect.closeTo(33, 0.01));
    });

    it('should handle losing prediction correctly', async () => {
      const predictions = [
        {
          id: 'pred-2', userId: userId2, marketId,
          predictedOutcome: 0, amountUsdc: 50, status: 'REVEALED',
        },
        {
          id: 'pred-winner', userId: 'winner-user', marketId,
          predictedOutcome: 1, amountUsdc: 60, status: 'REVEALED',
        },
      ];

      const userTrades = [{
        id: 'trade-2', userId: userId2, marketId, tradeType: 'BUY',
        outcome: 0, quantity: 100, pricePerUnit: 0.5,
        totalAmount: 50, feeAmount: 0.5, status: 'CONFIRMED',
      }];

      mockPredictionRepo.findMarketPredictions.mockResolvedValue(predictions);
      mockTradeRepo.findByUserAndMarket
        .mockResolvedValueOnce(userTrades)
        .mockResolvedValueOnce([]);

      await (marketService as any).settlePredictions(marketId, 1);

      expect(mockPredictionRepo.settlePrediction).toHaveBeenCalledWith('pred-2', false, -50);
    });

    it('should use different odds for different entry prices', async () => {
      const predictions = [
        {
          id: 'pred-3', userId: userId1, marketId,
          predictedOutcome: 1, amountUsdc: 75, status: 'REVEALED',
        },
        {
          id: 'pred-loser', userId: 'loser-user', marketId,
          predictedOutcome: 0, amountUsdc: 40, status: 'REVEALED',
        },
      ];

      const userTrades = [{
        id: 'trade-3', userId: userId1, marketId, tradeType: 'BUY',
        outcome: 1, quantity: 100, pricePerUnit: 0.75,
        totalAmount: 75, feeAmount: 0.75, status: 'CONFIRMED',
      }];

      mockPredictionRepo.findMarketPredictions.mockResolvedValue(predictions);
      mockTradeRepo.findByUserAndMarket
        .mockResolvedValueOnce(userTrades)
        .mockResolvedValueOnce([]);

      await (marketService as any).settlePredictions(marketId, 1);

      // 100 * 0.98 = 98 net, PnL = 98 - 75 = 23
      expect(mockPredictionRepo.settlePrediction).toHaveBeenCalledWith('pred-3', true, expect.closeTo(23, 0.01));
    });
  });

  describe('Fee percentage configuration', () => {
    it('should use default 2% fee when not configured', async () => {
      const predictions = [
        {
          id: 'pred-4', userId: userId1, marketId,
          predictedOutcome: 1, amountUsdc: 50, status: 'REVEALED',
        },
        {
          id: 'pred-other', userId: 'other-user', marketId,
          predictedOutcome: 0, amountUsdc: 30, status: 'REVEALED',
        },
      ];

      const userTrades = [{
        id: 'trade-4', userId: userId1, marketId, tradeType: 'BUY',
        outcome: 1, quantity: 100, pricePerUnit: 0.5,
        totalAmount: 50, feeAmount: 0.5, status: 'CONFIRMED',
      }];

      mockPredictionRepo.findMarketPredictions.mockResolvedValue(predictions);
      mockTradeRepo.findByUserAndMarket
        .mockResolvedValueOnce(userTrades)
        .mockResolvedValueOnce([]);

      await (marketService as any).settlePredictions(marketId, 1);

      // 100 * 0.98 = 98 net, PnL = 98 - 50 = 48
      expect(mockPredictionRepo.settlePrediction).toHaveBeenCalledWith('pred-4', true, expect.closeTo(48, 0.01));
    });

    it('should use configured fee percentage from environment', async () => {
      process.env.PLATFORM_FEE_PERCENTAGE = '5';

      const predictions = [
        {
          id: 'pred-5', userId: userId1, marketId,
          predictedOutcome: 1, amountUsdc: 50, status: 'REVEALED',
        },
        {
          id: 'pred-other2', userId: 'other-user2', marketId,
          predictedOutcome: 0, amountUsdc: 30, status: 'REVEALED',
        },
      ];

      const userTrades = [{
        id: 'trade-5', userId: userId1, marketId, tradeType: 'BUY',
        outcome: 1, quantity: 100, pricePerUnit: 0.5,
        totalAmount: 50, feeAmount: 0.5, status: 'CONFIRMED',
      }];

      mockPredictionRepo.findMarketPredictions.mockResolvedValue(predictions);
      mockTradeRepo.findByUserAndMarket
        .mockResolvedValueOnce(userTrades)
        .mockResolvedValueOnce([]);

      await (marketService as any).settlePredictions(marketId, 1);

      // 100 * 0.95 = 95 net, PnL = 95 - 50 = 45
      expect(mockPredictionRepo.settlePrediction).toHaveBeenCalledWith('pred-5', true, expect.closeTo(45, 0.01));
    });

    it('should handle 10% fee configuration', async () => {
      process.env.PLATFORM_FEE_PERCENTAGE = '10';

      const predictions = [
        {
          id: 'pred-6', userId: userId1, marketId,
          predictedOutcome: 1, amountUsdc: 60, status: 'REVEALED',
        },
        {
          id: 'pred-other3', userId: 'other-user3', marketId,
          predictedOutcome: 0, amountUsdc: 40, status: 'REVEALED',
        },
      ];

      const userTrades = [{
        id: 'trade-6', userId: userId1, marketId, tradeType: 'BUY',
        outcome: 1, quantity: 100, pricePerUnit: 0.6,
        totalAmount: 60, feeAmount: 0.6, status: 'CONFIRMED',
      }];

      mockPredictionRepo.findMarketPredictions.mockResolvedValue(predictions);
      mockTradeRepo.findByUserAndMarket
        .mockResolvedValueOnce(userTrades)
        .mockResolvedValueOnce([]);

      await (marketService as any).settlePredictions(marketId, 1);

      // 100 * 0.90 = 90 net, PnL = 90 - 60 = 30
      expect(mockPredictionRepo.settlePrediction).toHaveBeenCalledWith('pred-6', true, expect.closeTo(30, 0.01));
    });
  });

  describe('Edge case: Single participant', () => {
    it('should refund single participant minus fees', async () => {
      const predictions = [{
        id: 'pred-7', userId: userId1, marketId,
        predictedOutcome: 1, amountUsdc: 100, status: 'REVEALED',
      }];

      mockPredictionRepo.findMarketPredictions.mockResolvedValue(predictions);

      await (marketService as any).settlePredictions(marketId, 1);

      // Single participant: refund 98% (100 * 0.98 = 98), PnL = 98 - 100 = -2
      expect(mockPredictionRepo.settlePrediction).toHaveBeenCalledWith('pred-7', false, expect.closeTo(-2, 0.01));
    });

    it('should handle single participant with custom fee', async () => {
      process.env.PLATFORM_FEE_PERCENTAGE = '5';

      const predictions = [{
        id: 'pred-8', userId: userId1, marketId,
        predictedOutcome: 0, amountUsdc: 200, status: 'REVEALED',
      }];

      mockPredictionRepo.findMarketPredictions.mockResolvedValue(predictions);

      await (marketService as any).settlePredictions(marketId, 0);

      // 200 * 0.95 = 190, PnL = 190 - 200 = -10
      expect(mockPredictionRepo.settlePrediction).toHaveBeenCalledWith('pred-8', false, expect.closeTo(-10, 0.01));
    });
  });

  describe('Fallback calculation when no trade found', () => {
    it('should use market liquidity to calculate implied odds', async () => {
      const predictions = [
        {
          id: 'pred-9', userId: userId1, marketId,
          predictedOutcome: 1, amountUsdc: 60, status: 'REVEALED',
        },
        {
          id: 'pred-other9', userId: 'other-user9', marketId,
          predictedOutcome: 0, amountUsdc: 40, status: 'REVEALED',
        },
      ];

      mockPredictionRepo.findMarketPredictions.mockResolvedValue(predictions);
      mockTradeRepo.findByUserAndMarket
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await (marketService as any).settlePredictions(marketId, 1);

      // Market has 500 YES, 500 NO (50/50 odds)
      // Implied shares: 60 / 0.5 = 120, Gross: 120, Net: 117.6, PnL: 57.6
      expect(mockPredictionRepo.settlePrediction).toHaveBeenCalledWith('pred-9', true, expect.closeTo(57.6, 0.1));
    });

    it('should handle skewed market odds in fallback', async () => {
      const predictions = [
        {
          id: 'pred-10', userId: userId1, marketId,
          predictedOutcome: 1, amountUsdc: 70, status: 'REVEALED',
        },
        {
          id: 'pred-other10', userId: 'other-user10', marketId,
          predictedOutcome: 0, amountUsdc: 30, status: 'REVEALED',
        },
      ];

      mockPredictionRepo.findMarketPredictions.mockResolvedValue(predictions);
      mockTradeRepo.findByUserAndMarket
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      // Override market liquidity for this test
      vi.mocked(executeTransaction).mockImplementation(async (callback: any) => {
        const tx = {
          market: {
            findUnique: vi.fn().mockResolvedValue({
              yesLiquidity: 700, // 70% YES
              noLiquidity: 300, // 30% NO
            }),
          },
        };
        return await callback(tx);
      });

      await (marketService as any).settlePredictions(marketId, 1);

      // Implied odds: 0.7, Shares: 70/0.7 = 100, Gross: 100, Net: 98, PnL: 28
      expect(mockPredictionRepo.settlePrediction).toHaveBeenCalledWith('pred-10', true, expect.closeTo(28, 0.1));
    });
  });

  describe('Multiple participants with different odds', () => {
    it('should calculate PnL correctly for each participant based on their entry price', async () => {
      const predictions = [
        { id: 'pred-11', userId: userId1, marketId, predictedOutcome: 1, amountUsdc: 50, status: 'REVEALED' },
        { id: 'pred-12', userId: userId2, marketId, predictedOutcome: 1, amountUsdc: 80, status: 'REVEALED' },
      ];

      mockPredictionRepo.findMarketPredictions.mockResolvedValue(predictions);

      mockTradeRepo.findByUserAndMarket
        .mockResolvedValueOnce([{
          id: 'trade-11', userId: userId1, marketId, tradeType: 'BUY',
          outcome: 1, quantity: 100, pricePerUnit: 0.5,
          totalAmount: 50, feeAmount: 0.5, status: 'CONFIRMED',
        }])
        .mockResolvedValueOnce([{
          id: 'trade-12', userId: userId2, marketId, tradeType: 'BUY',
          outcome: 1, quantity: 100, pricePerUnit: 0.8,
          totalAmount: 80, feeAmount: 0.8, status: 'CONFIRMED',
        }]);

      await (marketService as any).settlePredictions(marketId, 1);

      expect(mockPredictionRepo.settlePrediction).toHaveBeenCalledWith('pred-11', true, expect.closeTo(48, 0.01));
      expect(mockPredictionRepo.settlePrediction).toHaveBeenCalledWith('pred-12', true, expect.closeTo(18, 0.01));
    });
  });
});
