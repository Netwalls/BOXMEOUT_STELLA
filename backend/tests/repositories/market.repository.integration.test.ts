// Integration tests for MarketRepository
import { describe, it, expect, beforeEach } from 'vitest';
import { MarketRepository } from '../../src/repositories/market.repository.js';
import { UserRepository } from '../../src/repositories/user.repository.js';
import { MarketCategory, MarketStatus } from '@prisma/client';

describe('MarketRepository Integration Tests', () => {
  const marketRepo = new MarketRepository();
  const userRepo = new UserRepository();

  async function createTestUser() {
    return await userRepo.createUser({
      email: `creator-${Date.now()}-${Math.random()}@example.com`,
      username: `creator-${Date.now()}-${Math.random()}`,
      passwordHash: 'hashed_password',
    });
  }

  describe('createMarket', () => {
    it('should create a new market', async () => {
      const testUser = await createTestUser();
      const timestamp = Date.now();
      const marketData = {
        contractAddress: `CONTRACT_TEST_${timestamp}`,
        title: 'Test Wrestling Match',
        description: 'A test match for integration testing',
        category: MarketCategory.WRESTLING,
        creatorId: testUser.id,
        outcomeA: 'Fighter A Wins',
        outcomeB: 'Fighter B Wins',
        closingAt: new Date(Date.now() + 86400000), // Tomorrow
      };

      const market = await marketRepo.createMarket(marketData);

      expect(market).toBeDefined();
      expect(market.title).toBe(marketData.title);
      expect(market.status).toBe(MarketStatus.OPEN);
      expect(market.totalVolume).toBeDefined();
    });
  });

  describe('findByContractAddress', () => {
    it('should find market by contract address', async () => {
      const testUser = await createTestUser();
      const timestamp = Date.now();
      const contractAddress = `CONTRACT_UNIQUE_${timestamp}`;
      await marketRepo.createMarket({
        contractAddress,
        title: 'Test Market',
        description: 'Test description',
        category: MarketCategory.BOXING,
        creatorId: testUser.id,
        outcomeA: 'Yes',
        outcomeB: 'No',
        closingAt: new Date(Date.now() + 86400000),
      });

      const found = await marketRepo.findByContractAddress(contractAddress);

      expect(found).toBeDefined();
      expect(found?.contractAddress).toBe(contractAddress);
    });
  });

  describe('findActiveMarkets', () => {
    it('should return only open markets', async () => {
      const testUser = await createTestUser();
      const timestamp = Date.now();
      // Create open market
      const openMarket = await marketRepo.createMarket({
        contractAddress: `CONTRACT_OPEN_${timestamp}`,
        title: 'Open Market',
        description: 'Test',
        category: MarketCategory.MMA,
        creatorId: testUser.id,
        outcomeA: 'Yes',
        outcomeB: 'No',
        closingAt: new Date(Date.now() + 86400000),
      });

      // Create closed market
      const closedMarket = await marketRepo.createMarket({
        contractAddress: `CONTRACT_CLOSED_${timestamp}`,
        title: 'Closed Market',
        description: 'Test',
        category: MarketCategory.MMA,
        creatorId: testUser.id,
        outcomeA: 'Yes',
        outcomeB: 'No',
        closingAt: new Date(Date.now() + 86400000),
      });

      await marketRepo.updateMarketStatus(closedMarket.id, MarketStatus.CLOSED);

      const activeMarkets = await marketRepo.findActiveMarkets();

      // Verify the open market is in the results and closed market is not
      expect(activeMarkets.some(m => m.id === openMarket.id)).toBe(true);
      expect(activeMarkets.some(m => m.id === closedMarket.id)).toBe(false);
      expect(activeMarkets.every(m => m.status === MarketStatus.OPEN)).toBe(true);
    });

    it('should filter by category', async () => {
      const testUser = await createTestUser();
      const timestamp = Date.now();
      const wrestlingMarket = await marketRepo.createMarket({
        contractAddress: `CONTRACT_WRESTLING_${timestamp}`,
        title: 'Wrestling Market',
        description: 'Test',
        category: MarketCategory.WRESTLING,
        creatorId: testUser.id,
        outcomeA: 'Yes',
        outcomeB: 'No',
        closingAt: new Date(Date.now() + 86400000),
      });

      const boxingMarket = await marketRepo.createMarket({
        contractAddress: `CONTRACT_BOXING_${timestamp}`,
        title: 'Boxing Market',
        description: 'Test',
        category: MarketCategory.BOXING,
        creatorId: testUser.id,
        outcomeA: 'Yes',
        outcomeB: 'No',
        closingAt: new Date(Date.now() + 86400000),
      });

      const wrestlingMarkets = await marketRepo.findActiveMarkets({
        category: MarketCategory.WRESTLING,
      });

      // Verify wrestling market is in results and boxing market is not
      expect(wrestlingMarkets.some(m => m.id === wrestlingMarket.id)).toBe(true);
      expect(wrestlingMarkets.some(m => m.id === boxingMarket.id)).toBe(false);
      expect(wrestlingMarkets.every(m => m.category === MarketCategory.WRESTLING)).toBe(true);
    });
  });

  describe('updateMarketStatus', () => {
    it('should update market status', async () => {
      const testUser = await createTestUser();
      const timestamp = Date.now();
      const market = await marketRepo.createMarket({
        contractAddress: `CONTRACT_STATUS_${timestamp}`,
        title: 'Status Test Market',
        description: 'Test',
        category: MarketCategory.SPORTS,
        creatorId: testUser.id,
        outcomeA: 'Yes',
        outcomeB: 'No',
        closingAt: new Date(Date.now() + 86400000),
      });

      const updated = await marketRepo.updateMarketStatus(
        market.id,
        MarketStatus.CLOSED,
        { closedAt: new Date() }
      );

      expect(updated.status).toBe(MarketStatus.CLOSED);
      expect(updated.closedAt).toBeDefined();
    });

    it('should resolve market with winning outcome', async () => {
      const testUser = await createTestUser();
      const timestamp = Date.now();
      const market = await marketRepo.createMarket({
        contractAddress: `CONTRACT_RESOLVE_${timestamp}`,
        title: 'Resolve Test Market',
        description: 'Test',
        category: MarketCategory.CRYPTO,
        creatorId: testUser.id,
        outcomeA: 'Yes',
        outcomeB: 'No',
        closingAt: new Date(Date.now() + 86400000),
      });

      await marketRepo.updateMarketStatus(market.id, MarketStatus.CLOSED);

      const resolved = await marketRepo.updateMarketStatus(
        market.id,
        MarketStatus.RESOLVED,
        {
          resolvedAt: new Date(),
          winningOutcome: 1,
          resolutionSource: 'oracle',
        }
      );

      expect(resolved.status).toBe(MarketStatus.RESOLVED);
      expect(resolved.winningOutcome).toBe(1);
      expect(resolved.resolutionSource).toBe('oracle');
    });
  });

  describe('updateMarketVolume', () => {
    it('should increment market volume', async () => {
      const testUser = await createTestUser();
      const timestamp = Date.now();
      const market = await marketRepo.createMarket({
        contractAddress: `CONTRACT_VOLUME_${timestamp}`,
        title: 'Volume Test Market',
        description: 'Test',
        category: MarketCategory.ENTERTAINMENT,
        creatorId: testUser.id,
        outcomeA: 'Yes',
        outcomeB: 'No',
        closingAt: new Date(Date.now() + 86400000),
      });

      const updated = await marketRepo.updateMarketVolume(market.id, 500, true);

      expect(Number(updated.totalVolume)).toBe(500);
      expect(updated.participantCount).toBe(1);
    });
  });

  describe('getTrendingMarkets', () => {
    it('should return markets sorted by volume', async () => {
      const testUser = await createTestUser();
      const timestamp = Date.now();
      const market1 = await marketRepo.createMarket({
        contractAddress: `CONTRACT_TREND_${timestamp}_1`,
        title: 'Low Volume Market',
        description: 'Test',
        category: MarketCategory.SPORTS,
        creatorId: testUser.id,
        outcomeA: 'Yes',
        outcomeB: 'No',
        closingAt: new Date(Date.now() + 86400000),
      });

      const market2 = await marketRepo.createMarket({
        contractAddress: `CONTRACT_TREND_${timestamp}_2`,
        title: 'High Volume Market',
        description: 'Test',
        category: MarketCategory.SPORTS,
        creatorId: testUser.id,
        outcomeA: 'Yes',
        outcomeB: 'No',
        closingAt: new Date(Date.now() + 86400000),
      });

      await marketRepo.updateMarketVolume(market1.id, 100);
      await marketRepo.updateMarketVolume(market2.id, 1000);

      const trending = await marketRepo.getTrendingMarkets(10);

      // Find our test markets in the results
      const market1Result = trending.find(m => m.id === market1.id);
      const market2Result = trending.find(m => m.id === market2.id);

      expect(market1Result).toBeDefined();
      expect(market2Result).toBeDefined();
      
      // Verify market2 (higher volume) appears before market1 (lower volume)
      const market1Index = trending.findIndex(m => m.id === market1.id);
      const market2Index = trending.findIndex(m => m.id === market2.id);
      
      expect(market2Index).toBeLessThan(market1Index);
      expect(Number(market2Result!.totalVolume)).toBeGreaterThan(
        Number(market1Result!.totalVolume)
      );
    });
  });
});
