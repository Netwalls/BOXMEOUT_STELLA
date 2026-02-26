import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarketService } from '../../src/services/market.service.js';
import { MarketStatus } from '@prisma/client';

describe('MarketService.resolveMarket Unit Tests', () => {
  let marketService: MarketService;
  let mockMarketRepository: any;
  let mockPredictionRepository: any;
  let mockUserService: any;
  let mockLeaderboardService: any;

  beforeEach(() => {
    mockMarketRepository = {
      findById: vi.fn(),
      updateMarketStatus: vi.fn(),
    };
    mockPredictionRepository = {
      findMarketPredictions: vi.fn().mockResolvedValue([]),
    };
    mockUserService = {
      calculateAndUpdateTier: vi.fn(),
    };
    mockLeaderboardService = {
      calculateRanks: vi.fn(),
      handleSettlement: vi.fn(),
    };

    marketService = new MarketService(
      mockMarketRepository,
      mockPredictionRepository,
      mockUserService,
      mockLeaderboardService
    );

    // Spy on settlePredictions to avoid database/transaction issues
    vi.spyOn(marketService as any, 'settlePredictions').mockResolvedValue(
      undefined
    );

    // Mock logger to avoid cluttering test output
    vi.mock('../../src/utils/logger.js', () => ({
      logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      },
    }));
  });

  it('should throw error if market not found', async () => {
    mockMarketRepository.findById.mockResolvedValue(null);
    await expect(marketService.resolveMarket('1', 1, 'source')).rejects.toThrow(
      'Market not found'
    );
  });

  it('should throw error if winning outcome is invalid', async () => {
    mockMarketRepository.findById.mockResolvedValue({
      status: MarketStatus.CLOSED,
    });
    await expect(marketService.resolveMarket('1', 2, 'source')).rejects.toThrow(
      'Winning outcome must be 0 or 1'
    );
  });

  it('should throw error if market is already RESOLVED', async () => {
    mockMarketRepository.findById.mockResolvedValue({
      status: MarketStatus.RESOLVED,
    });
    await expect(marketService.resolveMarket('1', 1, 'source')).rejects.toThrow(
      'Market cannot be resolved in RESOLVED status'
    );
  });

  it('should throw error if market is CANCELLED', async () => {
    mockMarketRepository.findById.mockResolvedValue({
      status: MarketStatus.CANCELLED,
    });
    await expect(marketService.resolveMarket('1', 1, 'source')).rejects.toThrow(
      'Market cannot be resolved in CANCELLED status'
    );
  });

  it('should throw error if market is DISPUTED', async () => {
    mockMarketRepository.findById.mockResolvedValue({
      status: MarketStatus.DISPUTED,
    });
    await expect(marketService.resolveMarket('1', 1, 'source')).rejects.toThrow(
      'Market cannot be resolved in DISPUTED status'
    );
  });

  it('should throw error if market is OPEN but closingAt has not passed', async () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    mockMarketRepository.findById.mockResolvedValue({
      status: MarketStatus.OPEN,
      closingAt: futureDate,
    });
    await expect(marketService.resolveMarket('1', 1, 'source')).rejects.toThrow(
      'Market is still open and has not reached closing time'
    );
  });

  it('should resolve market if status is CLOSED', async () => {
    mockMarketRepository.findById.mockResolvedValue({
      status: MarketStatus.CLOSED,
    });
    mockMarketRepository.updateMarketStatus.mockResolvedValue({
      id: '1',
      status: MarketStatus.RESOLVED,
    });

    const result = await marketService.resolveMarket('1', 1, 'source');

    expect(mockMarketRepository.updateMarketStatus).toHaveBeenCalledWith(
      '1',
      MarketStatus.RESOLVED,
      expect.objectContaining({ winningOutcome: 1, resolutionSource: 'source' })
    );
    expect(result.status).toBe(MarketStatus.RESOLVED);
  });

  it('should resolve market if status is OPEN but closingAt has passed', async () => {
    const pastDate = new Date();
    pastDate.setFullYear(pastDate.getFullYear() - 1);
    mockMarketRepository.findById.mockResolvedValue({
      status: MarketStatus.OPEN,
      closingAt: pastDate,
    });
    mockMarketRepository.updateMarketStatus.mockResolvedValue({
      id: '1',
      status: MarketStatus.RESOLVED,
    });

    const result = await marketService.resolveMarket('1', 1, 'source');

    expect(mockMarketRepository.updateMarketStatus).toHaveBeenCalledWith(
      '1',
      MarketStatus.RESOLVED,
      expect.objectContaining({ winningOutcome: 1, resolutionSource: 'source' })
    );
    expect(result.status).toBe(MarketStatus.RESOLVED);
  });
});
