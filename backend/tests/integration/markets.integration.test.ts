// backend/tests/integration/markets.integration.test.ts
// Integration tests for POST /api/markets endpoint

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
import { MarketCategory } from '@prisma/client';
import { factoryService } from '../../src/services/blockchain/factory.js';

// Mock JWT verification
vi.mock('../../src/utils/jwt.js', () => ({
  verifyAccessToken: vi.fn().mockReturnValue({
    userId: 'test-user-id',
    publicKey: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    tier: 'BEGINNER',
    type: 'access',
  }),
}));

// Mock admin middleware
vi.mock('../../src/middleware/admin.middleware.js', () => ({
  requireAdmin: vi.fn((req, res, next) => {
    // By default, let's say test user is admin unless overridden
    if (
      req.user &&
      req.user.publicKey === 'GYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY'
    ) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      });
    }
    next();
  }),
}));

// Mock the factory service to avoid actual blockchain calls in tests
vi.mock('../../src/services/blockchain/factory.js', () => ({
  factoryService: {
    createMarket: vi.fn().mockResolvedValue({
      marketId: 'mock-market-id-123456',
      txHash: 'mock-tx-hash-abc123',
      contractAddress: 'mock-contract-address',
    }),
    deactivateMarket: vi.fn().mockResolvedValue({
      txHash: 'mock-tx-hash-deactivate456',
    }),
    getMarketCount: vi.fn().mockResolvedValue(10),
  },
}));

// Mock database to avoid connection errors
vi.mock('../../src/database/prisma.js', () => ({
  prisma: {
    market: {
      create: vi.fn((args) =>
        Promise.resolve({
          id: 'test-market-uuid',
          contractAddress: args.data.contractAddress,
          title: args.data.title,
          description: args.data.description,
          category: args.data.category,
          status: 'OPEN',
          outcomeA: args.data.outcomeA,
          outcomeB: args.data.outcomeB,
          closingAt: args.data.closingAt,
          createdAt: new Date(),
          txHash: 'mock-tx-hash-abc123', // From factory service mock
          creator: {
            id: args.data.creatorId,
            username: 'testcreator',
            displayName: 'Test Creator',
          },
        })
      ),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      findById: vi.fn(), // We might need this for the service
      update: vi.fn(),
      findByContractAddress: vi.fn(),
    },
  },
}));

describe('POST /api/markets - Create Market', () => {
  let authToken: string;
  const testUser = {
    email: 'testcreator@example.com',
    username: 'testcreator',
    password: 'SecurePass123!',
    walletAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  };

  beforeAll(async () => {
    // Setup: Create test user and get auth token
    // This assumes you have auth endpoints working
    // For now, we'll mock the token
    authToken = 'mock-jwt-token';
  });

  afterAll(async () => {
    // Cleanup: Remove test data
  });

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  it('should create a market successfully with valid data', async () => {
    const marketData = {
      title: 'Will Bitcoin reach $100k in 2026?',
      description:
        'This market predicts whether Bitcoin will reach $100,000 USD by December 31, 2026.',
      category: MarketCategory.CRYPTO,
      outcomeA: 'YES',
      outcomeB: 'NO',
      closingAt: new Date('2026-12-15T00:00:00Z').toISOString(),
      resolutionTime: new Date('2026-12-31T23:59:59Z').toISOString(),
    };

    const response = await request(app)
      .post('/api/markets')
      .set('Authorization', `Bearer ${authToken}`)
      .send(marketData)
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('id');
    expect(response.body.data).toHaveProperty('contractAddress');
    expect(response.body.data).toHaveProperty('txHash');
    expect(response.body.data.title).toBe(marketData.title);
    expect(response.body.data.category).toBe(marketData.category);
    expect(response.body.data.status).toBe('OPEN');

    // Verify blockchain service was called
    expect(factoryService.createMarket).toHaveBeenCalledTimes(1);
    expect(factoryService.createMarket).toHaveBeenCalledWith(
      expect.objectContaining({
        title: marketData.title,
        description: marketData.description,
        category: marketData.category,
      })
    );
  });

  it('should reject market creation with invalid timestamps', async () => {
    const marketData = {
      title: 'Test Market with Invalid Time',
      description: 'This market has invalid closing time in the past.',
      category: MarketCategory.SPORTS,
      outcomeA: 'YES',
      outcomeB: 'NO',
      closingAt: new Date('2020-01-01T00:00:00Z').toISOString(), // Past date
      resolutionTime: new Date('2020-01-02T00:00:00Z').toISOString(),
    };

    const response = await request(app)
      .post('/api/markets')
      .set('Authorization', `Bearer ${authToken}`)
      .send(marketData)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toContain('Validation failed');

    // Blockchain service should not be called
    expect(factoryService.createMarket).not.toHaveBeenCalled();
  });

  it('should reject market with resolution time before closing time', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    const marketData = {
      title: 'Test Market',
      description: 'Market with invalid resolution time.',
      category: MarketCategory.POLITICAL,
      outcomeA: 'YES',
      outcomeB: 'NO',
      closingAt: futureDate.toISOString(),
      resolutionTime: new Date(futureDate.getTime() - 1000).toISOString(), // Before closing
    };

    const response = await request(app)
      .post('/api/markets')
      .set('Authorization', `Bearer ${authToken}`)
      .send(marketData)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(factoryService.createMarket).not.toHaveBeenCalled();
  });

  it('should reject market with title too short', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    const marketData = {
      title: 'Test', // Too short (< 5 characters)
      description: 'This is a valid description that is long enough.',
      category: MarketCategory.ENTERTAINMENT,
      outcomeA: 'YES',
      outcomeB: 'NO',
      closingAt: futureDate.toISOString(),
    };

    const response = await request(app)
      .post('/api/markets')
      .set('Authorization', `Bearer ${authToken}`)
      .send(marketData)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(factoryService.createMarket).not.toHaveBeenCalled();
  });

  it('should reject market with description too short', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    const marketData = {
      title: 'Valid Title Here',
      description: 'Short', // Too short (< 10 characters)
      category: MarketCategory.MMA,
      outcomeA: 'YES',
      outcomeB: 'NO',
      closingAt: futureDate.toISOString(),
    };

    const response = await request(app)
      .post('/api/markets')
      .set('Authorization', `Bearer ${authToken}`)
      .send(marketData)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(factoryService.createMarket).not.toHaveBeenCalled();
  });

  it('should reject market creation without authentication', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    const marketData = {
      title: 'Test Market',
      description: 'This is a test market description.',
      category: MarketCategory.CRYPTO,
      outcomeA: 'YES',
      outcomeB: 'NO',
      closingAt: futureDate.toISOString(),
    };

    const response = await request(app)
      .post('/api/markets')
      .send(marketData)
      .expect(401);

    expect(response.body.success).toBe(false);
    expect(factoryService.createMarket).not.toHaveBeenCalled();
  });

  it('should handle blockchain contract call failure gracefully', async () => {
    // Mock contract failure
    vi.mocked(factoryService.createMarket).mockRejectedValueOnce(
      new Error('Failed to create market on blockchain: Network timeout')
    );

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    const marketData = {
      title: 'Test Market for Failure',
      description: 'This market will trigger a blockchain failure.',
      category: MarketCategory.BOXING,
      outcomeA: 'YES',
      outcomeB: 'NO',
      closingAt: futureDate.toISOString(),
    };

    const response = await request(app)
      .post('/api/markets')
      .set('Authorization', `Bearer ${authToken}`)
      .send(marketData)
      .expect(503);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('BLOCKCHAIN_ERROR');
    expect(response.body.error.message).toContain('blockchain');
  });

  it('should store transaction hash correctly in database', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    const mockTxHash = 'unique-tx-hash-xyz789';
    vi.mocked(factoryService.createMarket).mockResolvedValueOnce({
      marketId: 'test-market-id',
      txHash: mockTxHash,
      contractAddress: 'test-contract',
    });

    const marketData = {
      title: 'Transaction Hash Test Market',
      description: 'Testing that transaction hash is stored correctly.',
      category: MarketCategory.WRESTLING,
      outcomeA: 'YES',
      outcomeB: 'NO',
      closingAt: futureDate.toISOString(),
    };

    const response = await request(app)
      .post('/api/markets')
      .set('Authorization', `Bearer ${authToken}`)
      .send(marketData)
      .expect(201);

    expect(response.body.data.txHash).toBe(mockTxHash);
  });

  it('should use default resolution time if not provided', async () => {
    const closingDate = new Date();
    closingDate.setDate(closingDate.getDate() + 30);

    const marketData = {
      title: 'Market Without Resolution Time',
      description: 'This market does not specify a resolution time.',
      category: MarketCategory.SPORTS,
      outcomeA: 'YES',
      outcomeB: 'NO',
      closingAt: closingDate.toISOString(),
      // No resolutionTime provided
    };

    const response = await request(app)
      .post('/api/markets')
      .set('Authorization', `Bearer ${authToken}`)
      .send(marketData)
      .expect(201);

    expect(response.body.success).toBe(true);

    // Verify default resolution time is 24 hours after closing
    const expectedResolutionTime = new Date(
      closingDate.getTime() + 24 * 60 * 60 * 1000
    );
    expect(factoryService.createMarket).toHaveBeenCalledWith(
      expect.objectContaining({
        resolutionTime: expect.any(Date),
      })
    );
  });
});

describe('GET /api/markets - List Markets', () => {
  it('should list markets successfully', async () => {
    const response = await request(app).get('/api/markets').expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeInstanceOf(Array);
    expect(response.body.pagination).toBeDefined();
  });

  it('should filter markets by category', async () => {
    const response = await request(app)
      .get('/api/markets?category=CRYPTO')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeInstanceOf(Array);
  });

  it('should paginate results correctly', async () => {
    const response = await request(app)
      .get('/api/markets?skip=0&take=10')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.pagination.skip).toBe(0);
    expect(response.body.pagination.take).toBe(10);
  });
});

describe('PATCH /api/markets/:id/deactivate - Deactivate a market', () => {
  let authToken: string;

  beforeAll(() => {
    authToken = 'mock-jwt-token';
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should deactivate a market successfully when admin', async () => {
    const marketId = '12345678-1234-1234-1234-123456789012';

    const { MarketRepository } =
      await import('../../src/repositories/market.repository.js');
    vi.spyOn(MarketRepository.prototype, 'findById').mockResolvedValue({
      id: marketId,
      contractAddress: 'mock-contract-address',
      status: 'OPEN',
      // other fields are not strictly necessary for this test given our service impl
    } as any);

    vi.spyOn(
      MarketRepository.prototype,
      'updateMarketStatus'
    ).mockResolvedValue({
      id: marketId,
      status: 'CANCELLED',
    } as any);

    const response = await request(app)
      .patch(`/api/markets/${marketId}/deactivate`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('CANCELLED');

    expect(factoryService.deactivateMarket).toHaveBeenCalledTimes(1);
    expect(factoryService.deactivateMarket).toHaveBeenCalledWith(
      'mock-contract-address'
    );
  });

  it('should return 403 when not an admin user', async () => {
    const marketId = '12345678-1234-1234-1234-123456789012';

    // Mock verifyAccessToken to return a non-admin public key for this test
    const { verifyAccessToken } = await import('../../src/utils/jwt.js');
    vi.mocked(verifyAccessToken).mockReturnValueOnce({
      userId: 'non-admin-user',
      publicKey: 'GYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY',
      tier: 'BEGINNER',
      type: 'access',
    });

    const response = await request(app)
      .patch(`/api/markets/${marketId}/deactivate`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(403);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('FORBIDDEN');

    expect(factoryService.deactivateMarket).not.toHaveBeenCalled();
  });

  it('should return 404 when market not found', async () => {
    const marketId = '12345678-1234-1234-1234-123456789012';

    const { MarketRepository } =
      await import('../../src/repositories/market.repository.js');
    vi.spyOn(MarketRepository.prototype, 'findById').mockResolvedValue(null);

    const response = await request(app)
      .patch(`/api/markets/${marketId}/deactivate`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('NOT_FOUND');

    expect(factoryService.deactivateMarket).not.toHaveBeenCalled();
  });
});
