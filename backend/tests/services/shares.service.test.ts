// Shares service unit tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SharesService } from '../../src/services/shares.service.js';
import { SharesRepository } from '../../src/repositories/shares.repository.js';
import { MarketRepository } from '../../src/repositories/market.repository.js';
import { ammService } from '../../src/services/blockchain/amm.js';
import { MarketStatus } from '@prisma/client';

// Mock dependencies
vi.mock('../../src/repositories/shares.repository.js');
vi.mock('../../src/repositories/market.repository.js');
vi.mock('../../src/services/blockchain/amm.js');

describe('SharesService', () => {
  let sharesService: SharesService;
  let mockSharesRepository: any;
  let mockMarketRepository: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create service instance
    sharesService = new SharesService();

    // Get mock instances
    mockSharesRepository = vi.mocked(SharesRepository).mock.instances[0];
    mockMarketRepository = vi.mocked(MarketRepository).mock.instances[0];
  });

  describe('recordPurchase', () => {
    it('should create a new position when user has no existing position', async () => {
      const userId = 'user-1';
      const marketId = 'market-1';
      const outcome = 1;
      const quantity = 100;
      const totalCost = 55;

      mockSharesRepository.findUserMarketShare = vi.fn().mockResolvedValue(null);
      mockSharesRepository.createShare = vi.fn().mockResolvedValue({
        id: 'share-1',
        userId,
        marketId,
        outcome,
        quantity,
        costBasis: totalCost,
        entryPrice: 0.55,
      });

      const result = await sharesService.recordPurchase(
        userId,
        marketId,
        outcome,
        quantity,
        totalCost
      );

      expect(mockSharesRepository.findUserMarketShare).toHaveBeenCalledWith(
        userId,
        marketId,
        outcome
      );
      expect(mockSharesRepository.createShare).toHaveBeenCalledWith({
        userId,
        marketId,
        outcome,
        quantity,
        costBasis: totalCost,
        entryPrice: 0.55,
      });
      expect(result.id).toBe('share-1');
    });

    it('should average position when user has existing position', async () => {
      const userId = 'user-1';
      const marketId = 'market-1';
      const outcome = 1;

      // Existing position: 100 shares at $0.50 each = $50 cost basis
      const existingShare = {
        id: 'share-1',
        userId,
        marketId,
        outcome,
        quantity: 100,
        costBasis: 50,
        entryPrice: 0.5,
      };

      // New purchase: 100 shares at $0.60 each = $60 cost
      const newQuantity = 100;
      const newTotalCost = 60;

      mockSharesRepository.findUserMarketShare = vi
        .fn()
        .mockResolvedValue(existingShare);
      mockSharesRepository.updateSharePosition = vi.fn().mockResolvedValue({
        ...existingShare,
        quantity: 200,
        costBasis: 110,
        entryPrice: 0.55,
      });

      const result = await sharesService.recordPurchase(
        userId,
        marketId,
        outcome,
        newQuantity,
        newTotalCost
      );

      expect(mockSharesRepository.updateSharePosition).toHaveBeenCalledWith(
        'share-1',
        {
          quantity: 200, // 100 + 100
          costBasis: 110, // 50 + 60
          entryPrice: 0.55, // 110 / 200
        }
      );
    });
  });

  describe('recordSale', () => {
    it('should throw error if position not found', async () => {
      mockSharesRepository.findUserMarketShare = vi.fn().mockResolvedValue(null);

      await expect(
        sharesService.recordSale('user-1', 'market-1', 1, 50, 30)
      ).rejects.toThrow('No position found to sell');
    });

    it('should throw error if insufficient shares', async () => {
      const share = {
        id: 'share-1',
        quantity: 50,
        costBasis: 25,
      };

      mockSharesRepository.findUserMarketShare = vi.fn().mockResolvedValue(share);

      await expect(
        sharesService.recordSale('user-1', 'market-1', 1, 100, 60)
      ).rejects.toThrow('Insufficient shares to sell');
    });

    it('should calculate realized PnL correctly', async () => {
      const share = {
        id: 'share-1',
        userId: 'user-1',
        marketId: 'market-1',
        outcome: 1,
        quantity: 100,
        costBasis: 50, // $0.50 per share
      };

      mockSharesRepository.findUserMarketShare = vi.fn().mockResolvedValue(share);
      mockSharesRepository.recordSale = vi.fn().mockResolvedValue({
        ...share,
        quantity: 50,
        soldQuantity: 50,
        realizedPnl: 5, // Sold 50 shares for $30, cost was $25
      });

      const result = await sharesService.recordSale(
        'user-1',
        'market-1',
        1,
        50, // Sell 50 shares
        30 // For $30
      );

      // Cost of 50 shares = (50 / 100) * 50 = $25
      // Proceeds = $30
      // Realized PnL = $30 - $25 = $5
      expect(mockSharesRepository.recordSale).toHaveBeenCalledWith(
        'share-1',
        50,
        5
      );
    });
  });

  describe('getPortfolioSummary', () => {
    it('should calculate total PnL and return percentage', async () => {
      const summary = {
        totalPositions: 3,
        totalCostBasis: 100,
        totalCurrentValue: 120,
        totalUnrealizedPnl: 20,
        totalRealizedPnl: 10,
      };

      mockSharesRepository.getPortfolioSummary = vi
        .fn()
        .mockResolvedValue(summary);

      const result = await sharesService.getPortfolioSummary('user-1');

      expect(result.totalPnl).toBe(30); // 20 + 10
      expect(result.returnPercentage).toBe(30); // (30 / 100) * 100
    });

    it('should handle zero cost basis', async () => {
      const summary = {
        totalPositions: 0,
        totalCostBasis: 0,
        totalCurrentValue: 0,
        totalUnrealizedPnl: 0,
        totalRealizedPnl: 0,
      };

      mockSharesRepository.getPortfolioSummary = vi
        .fn()
        .mockResolvedValue(summary);

      const result = await sharesService.getPortfolioSummary('user-1');

      expect(result.returnPercentage).toBe(0);
    });
  });

  describe('calculateCurrentValue (private method testing via getUserPositions)', () => {
    it('should use winning outcome value for resolved markets', async () => {
      const share = {
        id: 'share-1',
        userId: 'user-1',
        marketId: 'market-1',
        outcome: 1,
        quantity: 100,
        costBasis: 50,
        market: {
          id: 'market-1',
          status: MarketStatus.RESOLVED,
          winningOutcome: 1,
          contractAddress: '0x123',
        },
      };

      mockSharesRepository.findUserShares = vi.fn().mockResolvedValue([share]);
      mockSharesRepository.updateShareValue = vi.fn().mockResolvedValue(share);

      const result = await sharesService.getUserPositions('user-1');

      // Winner: currentValue = quantity = 100
      // unrealizedPnl = 100 - 50 = 50
      expect(mockSharesRepository.updateShareValue).toHaveBeenCalledWith(
        'share-1',
        100,
        50
      );
    });

    it('should use zero value for losing outcome in resolved markets', async () => {
      const share = {
        id: 'share-1',
        userId: 'user-1',
        marketId: 'market-1',
        outcome: 0,
        quantity: 100,
        costBasis: 50,
        market: {
          id: 'market-1',
          status: MarketStatus.RESOLVED,
          winningOutcome: 1,
          contractAddress: '0x123',
        },
      };

      mockSharesRepository.findUserShares = vi.fn().mockResolvedValue([share]);
      mockSharesRepository.updateShareValue = vi.fn().mockResolvedValue(share);

      await sharesService.getUserPositions('user-1');

      // Loser: currentValue = 0
      // unrealizedPnl = 0 - 50 = -50
      expect(mockSharesRepository.updateShareValue).toHaveBeenCalledWith(
        'share-1',
        0,
        -50
      );
    });

    it('should use zero value for cancelled markets', async () => {
      const share = {
        id: 'share-1',
        userId: 'user-1',
        marketId: 'market-1',
        outcome: 1,
        quantity: 100,
        costBasis: 50,
        market: {
          id: 'market-1',
          status: MarketStatus.CANCELLED,
          contractAddress: '0x123',
        },
      };

      mockSharesRepository.findUserShares = vi.fn().mockResolvedValue([share]);
      mockSharesRepository.updateShareValue = vi.fn().mockResolvedValue(share);

      await sharesService.getUserPositions('user-1');

      expect(mockSharesRepository.updateShareValue).toHaveBeenCalledWith(
        'share-1',
        0,
        -50
      );
    });

    it('should use AMM spot price for open markets', async () => {
      const share = {
        id: 'share-1',
        userId: 'user-1',
        marketId: 'market-1',
        outcome: 1,
        quantity: 100,
        costBasis: 50,
        market: {
          id: 'market-1',
          status: MarketStatus.OPEN,
          contractAddress: '0x123',
        },
      };

      mockSharesRepository.findUserShares = vi.fn().mockResolvedValue([share]);
      mockSharesRepository.updateShareValue = vi.fn().mockResolvedValue(share);

      // Mock AMM service
      vi.mocked(ammService.getPoolState).mockResolvedValue({
        reserves: { yes: BigInt(1000000), no: BigInt(1000000) },
        odds: { yes: 0.65, no: 0.35 },
      });

      await sharesService.getUserPositions('user-1');

      // currentValue = 100 * 0.65 = 65
      // unrealizedPnl = 65 - 50 = 15
      expect(mockSharesRepository.updateShareValue).toHaveBeenCalledWith(
        'share-1',
        65,
        15
      );
    });

    it('should fallback to last known value on AMM error', async () => {
      const share = {
        id: 'share-1',
        userId: 'user-1',
        marketId: 'market-1',
        outcome: 1,
        quantity: 100,
        costBasis: 50,
        currentValue: 60,
        unrealizedPnl: 10,
        market: {
          id: 'market-1',
          status: MarketStatus.OPEN,
          contractAddress: '0x123',
        },
      };

      mockSharesRepository.findUserShares = vi.fn().mockResolvedValue([share]);
      mockSharesRepository.updateShareValue = vi.fn().mockResolvedValue(share);

      // Mock AMM service to throw error
      vi.mocked(ammService.getPoolState).mockRejectedValue(
        new Error('RPC error')
      );

      await sharesService.getUserPositions('user-1');

      // Should use last known values
      expect(mockSharesRepository.updateShareValue).toHaveBeenCalledWith(
        'share-1',
        60,
        10
      );
    });
  });

  describe('getPositionBreakdown', () => {
    it('should group positions by outcome', async () => {
      const shares = [
        {
          id: 'share-1',
          outcome: 1,
          currentValue: 100,
          costBasis: 80,
          unrealizedPnl: 20,
        },
        {
          id: 'share-2',
          outcome: 1,
          currentValue: 50,
          costBasis: 45,
          unrealizedPnl: 5,
        },
        {
          id: 'share-3',
          outcome: 0,
          currentValue: 75,
          costBasis: 70,
          unrealizedPnl: 5,
        },
      ];

      mockSharesRepository.findUserShares = vi.fn().mockResolvedValue(shares);

      const result = await sharesService.getPositionBreakdown('user-1');

      expect(result.yes.count).toBe(2);
      expect(result.yes.totalValue).toBe(150);
      expect(result.yes.totalCostBasis).toBe(125);
      expect(result.yes.totalUnrealizedPnl).toBe(25);

      expect(result.no.count).toBe(1);
      expect(result.no.totalValue).toBe(75);
      expect(result.no.totalCostBasis).toBe(70);
      expect(result.no.totalUnrealizedPnl).toBe(5);
    });
  });
});
