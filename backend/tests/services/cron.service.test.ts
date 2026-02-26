// backend/tests/services/cron.service.test.ts
// Unit tests for CronService.pollOracleConsensus()

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CronService } from '../../src/services/cron.service.js';

// Mock oracleService at module level
vi.mock('../../src/services/blockchain/oracle.js', () => ({
  oracleService: {
    checkConsensus: vi.fn(),
  },
}));

import { oracleService } from '../../src/services/blockchain/oracle.js';

describe('CronService.pollOracleConsensus()', () => {
  let cronService: CronService;
  let mockMarketRepository: any;
  let mockMarketService: any;

  const closedMarket = (id: string) => ({
    id,
    status: 'CLOSED',
    closedAt: new Date(),
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockMarketRepository = {
      getClosedMarketsAwaitingResolution: vi.fn(),
    };

    mockMarketService = {
      resolveMarket: vi.fn(),
    };

    cronService = new CronService(mockMarketRepository, mockMarketService);
  });

  it('should do nothing when no CLOSED markets exist', async () => {
    mockMarketRepository.getClosedMarketsAwaitingResolution.mockResolvedValue(
      []
    );

    await cronService.pollOracleConsensus();

    expect(oracleService.checkConsensus).not.toHaveBeenCalled();
    expect(mockMarketService.resolveMarket).not.toHaveBeenCalled();
  });

  it('should skip markets where oracle returns null (no consensus)', async () => {
    mockMarketRepository.getClosedMarketsAwaitingResolution.mockResolvedValue([
      closedMarket('market-abc'),
    ]);
    vi.mocked(oracleService.checkConsensus).mockResolvedValue(null);

    await cronService.pollOracleConsensus();

    expect(oracleService.checkConsensus).toHaveBeenCalledWith('market-abc');
    expect(mockMarketService.resolveMarket).not.toHaveBeenCalled();
  });

  it('should resolve a market when oracle returns a winning outcome', async () => {
    mockMarketRepository.getClosedMarketsAwaitingResolution.mockResolvedValue([
      closedMarket('market-abc'),
    ]);
    vi.mocked(oracleService.checkConsensus).mockResolvedValue(1);
    mockMarketService.resolveMarket.mockResolvedValue({
      id: 'market-abc',
      resolvedAt: new Date(),
    });

    await cronService.pollOracleConsensus();

    expect(oracleService.checkConsensus).toHaveBeenCalledWith('market-abc');
    expect(mockMarketService.resolveMarket).toHaveBeenCalledWith(
      'market-abc',
      1,
      'oracle-consensus'
    );
  });

  it('should resolve outcome 0 correctly (falsy but valid)', async () => {
    mockMarketRepository.getClosedMarketsAwaitingResolution.mockResolvedValue([
      closedMarket('market-xyz'),
    ]);
    vi.mocked(oracleService.checkConsensus).mockResolvedValue(0);
    mockMarketService.resolveMarket.mockResolvedValue({
      id: 'market-xyz',
      resolvedAt: new Date(),
    });

    await cronService.pollOracleConsensus();

    expect(mockMarketService.resolveMarket).toHaveBeenCalledWith(
      'market-xyz',
      0,
      'oracle-consensus'
    );
  });

  it('should process all markets and skip those without consensus', async () => {
    mockMarketRepository.getClosedMarketsAwaitingResolution.mockResolvedValue([
      closedMarket('market-1'),
      closedMarket('market-2'),
      closedMarket('market-3'),
    ]);
    vi.mocked(oracleService.checkConsensus)
      .mockResolvedValueOnce(null) // market-1: no consensus
      .mockResolvedValueOnce(1) // market-2: consensus → outcome 1
      .mockResolvedValueOnce(0); // market-3: consensus → outcome 0

    mockMarketService.resolveMarket.mockResolvedValue({
      resolvedAt: new Date(),
    });

    await cronService.pollOracleConsensus();

    expect(oracleService.checkConsensus).toHaveBeenCalledTimes(3);
    expect(mockMarketService.resolveMarket).toHaveBeenCalledTimes(2);
    expect(mockMarketService.resolveMarket).toHaveBeenCalledWith(
      'market-2',
      1,
      'oracle-consensus'
    );
    expect(mockMarketService.resolveMarket).toHaveBeenCalledWith(
      'market-3',
      0,
      'oracle-consensus'
    );
  });

  it('should continue processing remaining markets when one fails', async () => {
    mockMarketRepository.getClosedMarketsAwaitingResolution.mockResolvedValue([
      closedMarket('market-bad'),
      closedMarket('market-good'),
    ]);
    vi.mocked(oracleService.checkConsensus)
      .mockRejectedValueOnce(new Error('RPC timeout'))
      .mockResolvedValueOnce(1);

    mockMarketService.resolveMarket.mockResolvedValue({
      resolvedAt: new Date(),
    });

    await cronService.pollOracleConsensus();

    // Should not throw; should still resolve the second market
    expect(oracleService.checkConsensus).toHaveBeenCalledTimes(2);
    expect(mockMarketService.resolveMarket).toHaveBeenCalledTimes(1);
    expect(mockMarketService.resolveMarket).toHaveBeenCalledWith(
      'market-good',
      1,
      'oracle-consensus'
    );
  });

  it('should return early and not call oracle if fetching markets fails', async () => {
    mockMarketRepository.getClosedMarketsAwaitingResolution.mockRejectedValue(
      new Error('DB connection lost')
    );

    await cronService.pollOracleConsensus();

    expect(oracleService.checkConsensus).not.toHaveBeenCalled();
    expect(mockMarketService.resolveMarket).not.toHaveBeenCalled();
  });

  it('should continue when resolveMarket throws for one market', async () => {
    mockMarketRepository.getClosedMarketsAwaitingResolution.mockResolvedValue([
      closedMarket('market-fail'),
      closedMarket('market-ok'),
    ]);
    vi.mocked(oracleService.checkConsensus).mockResolvedValue(1);
    mockMarketService.resolveMarket
      .mockRejectedValueOnce(new Error('Settlement failed'))
      .mockResolvedValueOnce({ resolvedAt: new Date() });

    await cronService.pollOracleConsensus();

    expect(mockMarketService.resolveMarket).toHaveBeenCalledTimes(2);
  });
});
