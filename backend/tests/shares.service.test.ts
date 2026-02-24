// backend/tests/shares.service.test.ts
// Unit tests for SharesService

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SharesService } from '../src/services/shares.service.js';
import { ShareRepository } from '../src/repositories/share.repository.js';
import { MarketRepository } from '../src/repositories/market.repository.js';
import { ammService } from '../src/services/blockchain/amm.js';
import { MarketStatus, MarketCategory } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

// Mock dependencies
vi.mock('../src/services/blockchain/amm.js');
vi.mock('../src/repositories/share.repository.js');
vi.mock('../src/repositories/market.repository.js');

describe('SharesService', () => {
  let sharesService: SharesService;
  let mockShareRepository: any;
  let mockMarketRepository: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock repositories
    mockShareRepository = {
      findActivePositionsByUser: vi.fn(),
      findByUserAndMarket: vi.fn(),
      updatePosition: vi.fn(),
    };

    mockMarketRepository = {
      findById: vi.fn(),
    };

    // Create service with mocked dependencies
    sharesService = new SharesService(
      mockShareRepository,
      mockMarketRepository
    );
  });

  describe('getUserPositions', () => {
    it('should return empty array when user has no positions', async () => {
      mockShareRepository.findActivePositionsByUser.mockResolvedValue([]);

      const result = await sharesService.getUserPositions('user-123');

      expect(result).toEqual([]);
      expect(mockShareRepository.findActivePositionsByUser).toHaveBeenCalledWith(
        'user-123'
      );
    });

    it('should calculate unrealized PnL correctly for open market', async () => {
      const mockShare = {
        id: 'share-1',
        userId: 'user-123',
        marketId: 'market-1',
        outcome: 1,
        quantity: new Decimal(100),
        costBasis: new Decimal(50),
        entryPrice: new Decimal(0.5),
        currentValue: new Decimal(50),
        unrealizedPnl: new Decimal(0),
        acquiredAt: new Date('2024-01-01'),
        market: {
          id: 'market-1',
          contractAddress: '0xabc',
          title: 'Test Market',
          status: MarketStatus.OPEN,
          outcomeA: 'NO',
          outcomeB: 'YES',
          category: MarketCategory.SPORTS,
        },
      };

      mockShareRepository.findActivePositionsByUser.mockResolvedValue([
        mockShare,
      ]);

      // Mock AMM to return current price of 0.7
      vi.mocked(ammService.getOdds).mockResolvedValue({
        yesOdds: 0.7,
        noOdds: 0.3,
        yesPercentage: 70,
        noPercentage: 30,
        yesLiquidity: 1000,
        noLiquidity: 1000,
        totalLiquidity: 2000,
      });

      const result = await sharesService.getUserPositions('user-123');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'share-1',
        marketId: 'market-1',
        marketTitle: 'Test Market',
        outcome: 1,
        outcomeName: 'YES',
        quantity: 100,
        costBasis: 50,
        entryPrice: 0.5,
        currentPrice: 0.7,
        currentValue: 70, // 100 * 0.7
        unrealizedPnl: 20, // 70 - 50
        unrealizedPnlPercentage: 40, // (20 / 50) * 100
      });

      expect(mockShareRepository.updatePosition).toHaveBeenCalledWith(
        'share-1',
        {
          currentValue: 70,
          unrealizedPnl: 20,
        }
      );
    });

    it('should use entry price for closed markets', async () => {
      const mockShare = {
        id: 'share-1',
        userId: 'user-123',
        marketId: 'market-1',
        outcome: 0,
        quantity: new Decimal(50),
        costBasis: new Decimal(30),
        entryPrice: new Decimal(0.6),
        currentValue: new Decimal(30),
        unrealizedPnl: new Decimal(0),
        acquiredAt: new Date('2024-01-01'),
        market: {
          id: 'market-1',
          contractAddress: '0xabc',
          title: 'Closed Market',
          status: MarketStatus.CLOSED,
          outcomeA: 'NO',
          outcomeB: 'YES',
          category: MarketCategory.POLITICS,
        },
      };

      mockShareRepository.findActivePositionsByUser.mockResolvedValue([
        mockShare,
      ]);

      const result = await sharesService.getUserPositions('user-123');

      expect(result).toHaveLength(1);
      expect(result[0].currentPrice).toBe(0.6); // Entry price used
      expect(ammService.getOdds).not.toHaveBeenCalled();
    });

    it('should handle multiple positions across different markets', async () => {
      const mockShares = [
        {
          id: 'share-1',
          userId: 'user-123',
          marketId: 'market-1',
          outcome: 1,
          quantity: new Decimal(100),
          costBasis: new Decimal(50),
          entryPrice: new Decimal(0.5),
          currentValue: new Decimal(50),
          unrealizedPnl: new Decimal(0),
          acquiredAt: new Date('2024-01-01'),
          market: {
            id: 'market-1',
            contractAddress: '0xabc',
            title: 'Market 1',
            status: MarketStatus.OPEN,
            outcomeA: 'NO',
            outcomeB: 'YES',
            category: MarketCategory.SPORTS,
          },
        },
        {
          id: 'share-2',
          userId: 'user-123',
          marketId: 'market-2',
          outcome: 0,
          quantity: new Decimal(200),
          costBasis: new Decimal(80),
          entryPrice: new Decimal(0.4),
          currentValue: new Decimal(80),
          unrealizedPnl: new Decimal(0),
          acquiredAt: new Date('2024-01-02'),
          market: {
            id: 'market-2',
            contractAddress: '0xdef',
            title: 'Market 2',
            status: MarketStatus.OPEN,
            outcomeA: 'NO',
            outcomeB: 'YES',
            category: MarketCategory.CRYPTO,
          },
        },
      ];

      mockShareRepository.findActivePositionsByUser.mockResolvedValue(
        mockShares
      );

      vi.mocked(ammService.getOdds)
        .mockResolvedValueOnce({
          yesOdds: 0.6,
          noOdds: 0.4,
          yesPercentage: 60,
          noPercentage: 40,
          yesLiquidity: 1000,
          noLiquidity: 1000,
          totalLiquidity: 2000,
        })
        .mockResolvedValueOnce({
          yesOdds: 0.55,
          noOdds: 0.45,
          yesPercentage: 55,
          noPercentage: 45,
          yesLiquidity: 1000,
          noLiquidity: 1000,
          totalLiquidity: 2000,
        });

      const result = await sharesService.getUserPositions('user-123');

      expect(result).toHaveLength(2);
      expect(result[0].marketTitle).toBe('Market 1');
      expect(result[1].marketTitle).toBe('Market 2');
    });
  });

  describe('getPortfolioSummary', () => {
    it('should aggregate portfolio metrics correctly', async () => {
      const mockShares = [
        {
          id: 'share-1',
          userId: 'user-123',
          marketId: 'market-1',
          outcome: 1,
          quantity: new Decimal(100),
          costBasis: new Decimal(50),
          entryPrice: new Decimal(0.5),
          currentValue: new Decimal(50),
          unrealizedPnl: new Decimal(0),
          acquiredAt: new Date('2024-01-01'),
          market: {
            id: 'market-1',
            contractAddress: '0xabc',
            title: 'Market 1',
            status: MarketStatus.OPEN,
            outcomeA: 'NO',
            outcomeB: 'YES',
            category: MarketCategory.SPORTS,
          },
        },
        {
          id: 'share-2',
          userId: 'user-123',
          marketId: 'market-2',
          outcome: 0,
          quantity: new Decimal(200),
          costBasis: new Decimal(100),
          entryPrice: new Decimal(0.5),
          currentValue: new Decimal(100),
          unrealizedPnl: new Decimal(0),
          acquiredAt: new Date('2024-01-02'),
          market: {
            id: 'market-2',
            contractAddress: '0xdef',
            title: 'Market 2',
            status: MarketStatus.OPEN,
            outcomeA: 'NO',
            outcomeB: 'YES',
            category: MarketCategory.CRYPTO,
          },
        },
      ];

      mockShareRepository.findActivePositionsByUser.mockResolvedValue(
        mockShares
      );

      vi.mocked(ammService.getOdds)
        .mockResolvedValueOnce({
          yesOdds: 0.7,
          noOdds: 0.3,
          yesPercentage: 70,
          noPercentage: 30,
          yesLiquidity: 1000,
          noLiquidity: 1000,
          totalLiquidity: 2000,
        })
        .mockResolvedValueOnce({
          yesOdds: 0.6,
          noOdds: 0.4,
          yesPercentage: 60,
          noPercentage: 40,
          yesLiquidity: 1000,
          noLiquidity: 1000,
          totalLiquidity: 2000,
        });

      const result = await sharesService.getPortfolioSummary('user-123');

      expect(result.totalPositions).toBe(2);
      expect(result.totalCostBasis).toBe(150); // 50 + 100
      expect(result.totalCurrentValue).toBe(150); // 70 + 80
      expect(result.totalUnrealizedPnl).toBe(0); // 150 - 150
      expect(result.positions).toHaveLength(2);
    });

    it('should return zero metrics for empty portfolio', async () => {
      mockShareRepository.findActivePositionsByUser.mockResolvedValue([]);

      const result = await sharesService.getPortfolioSummary('user-123');

      expect(result).toEqual({
        totalPositions: 0,
        totalCostBasis: 0,
        totalCurrentValue: 0,
        totalUnrealizedPnl: 0,
        totalUnrealizedPnlPercentage: 0,
        positions: [],
      });
    });
  });

  describe('getMarketPositions', () => {
    it('should return positions for specific market only', async () => {
      const mockShares = [
        {
          id: 'share-1',
          userId: 'user-123',
          marketId: 'market-1',
          outcome: 1,
          quantity: new Decimal(100),
          costBasis: new Decimal(50),
          entryPrice: new Decimal(0.5),
          currentValue: new Decimal(50),
          unrealizedPnl: new Decimal(0),
          acquiredAt: new Date('2024-01-01'),
          market: {
            id: 'market-1',
            contractAddress: '0xabc',
            title: 'Market 1',
            status: MarketStatus.OPEN,
            outcomeA: 'NO',
            outcomeB: 'YES',
            category: MarketCategory.SPORTS,
          },
        },
      ];

      mockShareRepository.findByUserAndMarket.mockResolvedValue(mockShares);

      vi.mocked(ammService.getOdds).mockResolvedValue({
        yesOdds: 0.6,
        noOdds: 0.4,
        yesPercentage: 60,
        noPercentage: 40,
        yesLiquidity: 1000,
        noLiquidity: 1000,
        totalLiquidity: 2000,
      });

      const result = await sharesService.getMarketPositions(
        'user-123',
        'market-1'
      );

      expect(result).toHaveLength(1);
      expect(result[0].marketId).toBe('market-1');
      expect(mockShareRepository.findByUserAndMarket).toHaveBeenCalledWith(
        'user-123',
        'market-1'
      );
    });

    it('should skip positions with zero quantity', async () => {
      const mockShares = [
        {
          id: 'share-1',
          userId: 'user-123',
          marketId: 'market-1',
          outcome: 1,
          quantity: new Decimal(0), // Zero quantity
          costBasis: new Decimal(50),
          entryPrice: new Decimal(0.5),
          currentValue: new Decimal(0),
          unrealizedPnl: new Decimal(0),
          acquiredAt: new Date('2024-01-01'),
          market: {
            id: 'market-1',
            contractAddress: '0xabc',
            title: 'Market 1',
            status: MarketStatus.OPEN,
            outcomeA: 'NO',
            outcomeB: 'YES',
            category: MarketCategory.SPORTS,
          },
        },
      ];

      mockShareRepository.findByUserAndMarket.mockResolvedValue(mockShares);

      const result = await sharesService.getMarketPositions(
        'user-123',
        'market-1'
      );

      expect(result).toHaveLength(0);
    });
  });
});
