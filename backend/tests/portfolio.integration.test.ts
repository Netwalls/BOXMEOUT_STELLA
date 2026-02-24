// backend/tests/portfolio.integration.test.ts
// Integration tests for portfolio endpoints

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';
import { prisma } from '../src/database/prisma.js';
import { MarketStatus, MarketCategory, UserTier } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

describe('Portfolio API Integration Tests', () => {
  let authToken: string;
  let userId: string;
  let marketId: string;

  beforeAll(async () => {
    // Create test user
    const user = await prisma.user.create({
      data: {
        email: 'portfolio@test.com',
        username: 'portfoliouser',
        passwordHash: 'hashed_password',
        publicKey: 'GTEST_PORTFOLIO_USER_KEY',
        usdcBalance: new Decimal(1000),
        tier: UserTier.BEGINNER,
      },
    });
    userId = user.id;

    // Create test market
    const market = await prisma.market.create({
      data: {
        contractAddress: '0xtest_portfolio_market',
        title: 'Test Portfolio Market',
        description: 'Market for portfolio testing',
        category: MarketCategory.SPORTS,
        status: MarketStatus.OPEN,
        creatorId: userId,
        outcomeA: 'NO',
        outcomeB: 'YES',
        closingAt: new Date(Date.now() + 86400000), // 24 hours from now
        yesLiquidity: new Decimal(1000),
        noLiquidity: new Decimal(1000),
      },
    });
    marketId = market.id;

    // Mock authentication - in real tests, you'd get a real token
    authToken = 'mock_jwt_token';
  });

  afterAll(async () => {
    // Cleanup
    await prisma.share.deleteMany({ where: { userId } });
    await prisma.market.deleteMany({ where: { id: marketId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up shares before each test
    await prisma.share.deleteMany({ where: { userId } });
  });

  describe('GET /api/portfolio', () => {
    it('should return empty portfolio for user with no positions', async () => {
      const response = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          totalPositions: 0,
          totalCostBasis: 0,
          totalCurrentValue: 0,
          totalUnrealizedPnl: 0,
          totalUnrealizedPnlPercentage: 0,
          positions: [],
        },
      });
    });

    it('should return portfolio summary with positions', async () => {
      // Create test positions
      await prisma.share.create({
        data: {
          userId,
          marketId,
          outcome: 1,
          quantity: new Decimal(100),
          costBasis: new Decimal(50),
          entryPrice: new Decimal(0.5),
          currentValue: new Decimal(60),
          unrealizedPnl: new Decimal(10),
        },
      });

      await prisma.share.create({
        data: {
          userId,
          marketId,
          outcome: 0,
          quantity: new Decimal(50),
          costBasis: new Decimal(30),
          entryPrice: new Decimal(0.6),
          currentValue: new Decimal(25),
          unrealizedPnl: new Decimal(-5),
        },
      });

      const response = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalPositions).toBe(2);
      expect(response.body.data.positions).toHaveLength(2);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/portfolio')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
        },
      });
    });
  });

  describe('GET /api/portfolio/positions', () => {
    it('should return all user positions', async () => {
      await prisma.share.create({
        data: {
          userId,
          marketId,
          outcome: 1,
          quantity: new Decimal(100),
          costBasis: new Decimal(50),
          entryPrice: new Decimal(0.5),
          currentValue: new Decimal(60),
          unrealizedPnl: new Decimal(10),
        },
      });

      const response = await request(app)
        .get('/api/portfolio/positions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          count: 1,
        },
      });
      expect(response.body.data.positions).toHaveLength(1);
      expect(response.body.data.positions[0]).toMatchObject({
        marketId,
        outcome: 1,
        quantity: 100,
      });
    });
  });

  describe('GET /api/portfolio/markets/:marketId', () => {
    it('should return positions for specific market', async () => {
      await prisma.share.create({
        data: {
          userId,
          marketId,
          outcome: 1,
          quantity: new Decimal(100),
          costBasis: new Decimal(50),
          entryPrice: new Decimal(0.5),
          currentValue: new Decimal(60),
          unrealizedPnl: new Decimal(10),
        },
      });

      const response = await request(app)
        .get(`/api/portfolio/markets/${marketId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          marketId,
          count: 1,
        },
      });
    });

    it('should return empty array for market with no positions', async () => {
      const response = await request(app)
        .get(`/api/portfolio/markets/${marketId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          marketId,
          count: 0,
          positions: [],
        },
      });
    });

    it('should validate marketId parameter', async () => {
      const response = await request(app)
        .get('/api/portfolio/markets/')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404); // Route not found
    });
  });

  describe('POST /api/portfolio/refresh', () => {
    it('should refresh position values successfully', async () => {
      await prisma.share.create({
        data: {
          userId,
          marketId,
          outcome: 1,
          quantity: new Decimal(100),
          costBasis: new Decimal(50),
          entryPrice: new Decimal(0.5),
          currentValue: new Decimal(50),
          unrealizedPnl: new Decimal(0),
        },
      });

      const response = await request(app)
        .post('/api/portfolio/refresh')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Portfolio positions refreshed successfully',
      });
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/portfolio/refresh')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
        },
      });
    });
  });
});
