import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../src/controllers/markets.controller.js', () => {
  const ctrl = {
    createMarket: vi.fn(),
    listMarkets: vi.fn((_req: any, res: any) => res.json({ success: true, data: [] })),
    getMarketDetails: vi.fn(),
    createPool: vi.fn(),
    deactivateMarket: vi.fn(),
  };
  return { marketsController: ctrl, MarketsController: vi.fn(() => ctrl) };
});

vi.mock('../../src/middleware/auth.middleware.js', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  optionalAuth: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../src/middleware/admin.middleware.js', () => ({
  requireAdmin: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const redisMock = { get: vi.fn(), setex: vi.fn() };
vi.mock('../../src/config/redis.js', () => ({
  getRedisClient: () => redisMock,
}));

const svcMock = {
  getMarketDetails: vi.fn(),
  createMarket: vi.fn(),
  listMarkets: vi.fn(),
  createPool: vi.fn(),
  deactivateMarket: vi.fn(),
};
vi.mock('../../src/services/market.service.js', () => ({
  MarketService: vi.fn(() => svcMock),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import marketsRoutes from '../../src/routes/markets.routes.js';
import { marketsController } from '../../src/controllers/markets.controller.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_ID = '00000000-0000-0000-0000-000000000001';

const mockMarket = {
  id: VALID_ID,
  contractAddress: 'CABC123',
  title: 'Will Fighter A win?',
  description: 'Test market',
  category: 'WRESTLING',
  status: 'OPEN',
  outcomeA: 'Fighter A wins',
  outcomeB: 'Fighter B wins',
  totalVolume: '1000.000000',
  participantCount: 42,
  feesCollected: '10.000000',
  yesLiquidity: '500.000000',
  noLiquidity: '500.000000',
  closingAt: new Date('2027-01-01').toISOString(),
  createdAt: new Date('2026-01-01').toISOString(),
  creator: { id: 'user-1', username: 'alice', displayName: 'Alice', avatarUrl: null },
  _count: { predictions: 42, trades: 100 },
  predictionStats: { total: 42, revealed: 30, settled: 10 },
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/markets', marketsRoutes);
  return app;
}

// ── Route-level tests ─────────────────────────────────────────────────────────

describe('GET /api/markets/:id — route', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  it('returns full market object with 200', async () => {
    vi.mocked(marketsController.getMarketDetails).mockImplementation(
      (_req, res) => { res.json({ success: true, data: mockMarket }); return Promise.resolve(); }
    );

    const res = await request(app).get(`/api/markets/${VALID_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const d = res.body.data;
    expect(d.id).toBe(VALID_ID);
    expect(d.title).toBeDefined();
    expect(d.status).toBeDefined();
    expect(d.totalVolume).toBeDefined();
    expect(d.participantCount).toBeDefined();
    expect(d.feesCollected).toBeDefined();
    expect(d.outcomeA).toBeDefined();
    expect(d.outcomeB).toBeDefined();
    expect(d.yesLiquidity).toBeDefined();
    expect(d.noLiquidity).toBeDefined();
    expect(d.creator).toBeDefined();
    expect(d.predictionStats).toBeDefined();
  });

  it('returns 404 when market not found', async () => {
    vi.mocked(marketsController.getMarketDetails).mockImplementation(
      (_req, res) => {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Market not found' } });
        return Promise.resolve();
      }
    );

    const res = await request(app).get(`/api/markets/${VALID_ID}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for invalid UUID param', async () => {
    const res = await request(app).get('/api/markets/not-a-uuid');
    expect(res.status).toBe(400);
  });
});

// ── Controller unit tests (Redis cache logic) ─────────────────────────────────
// Use the real MarketsController class via vi.importActual to test cache logic.

function mockReqRes(id: string) {
  const req: any = { params: { id }, log: { error: vi.fn() } };
  const res: any = {
    _status: 200,
    _body: null,
    status(s: number) { this._status = s; return this; },
    json(b: any) { this._body = b; return this; },
  };
  return { req, res };
}

describe('MarketsController.getMarketDetails — cache logic', () => {
  // We need the real class — get it via importActual
  let RealMarketsController: any;
  let controller: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const actual = await vi.importActual<any>('../../src/controllers/markets.controller.js');
    RealMarketsController = actual.MarketsController;
    controller = new RealMarketsController();
    // Inject svcMock so no real DB calls happen
    controller.marketService = svcMock;
  });

  it('serves from Redis cache when available', async () => {
    redisMock.get.mockResolvedValue(JSON.stringify(mockMarket));
    const { req, res } = mockReqRes(VALID_ID);

    await controller.getMarketDetails(req, res);

    expect(res._body.data.id).toBe(VALID_ID);
    expect(svcMock.getMarketDetails).not.toHaveBeenCalled();
  });

  it('caches result in Redis for 5 seconds on cache miss', async () => {
    redisMock.get.mockResolvedValue(null);
    svcMock.getMarketDetails.mockResolvedValue(mockMarket);
    const { req, res } = mockReqRes(VALID_ID);

    await controller.getMarketDetails(req, res);

    expect(redisMock.setex).toHaveBeenCalledWith(`market:${VALID_ID}`, 5, expect.any(String));
    expect(res._body.data.id).toBe(VALID_ID);
  });

  it('still returns data when Redis is unavailable', async () => {
    redisMock.get.mockRejectedValue(new Error('Redis down'));
    svcMock.getMarketDetails.mockResolvedValue(mockMarket);
    const { req, res } = mockReqRes(VALID_ID);

    await controller.getMarketDetails(req, res);

    expect(res._body.data.id).toBe(VALID_ID);
  });

  it('returns 404 when market not found', async () => {
    redisMock.get.mockResolvedValue(null);
    svcMock.getMarketDetails.mockRejectedValue(new Error('Market not found'));
    const { req, res } = mockReqRes(VALID_ID);

    await controller.getMarketDetails(req, res);

    expect(res._status).toBe(404);
    expect(res._body.error.code).toBe('NOT_FOUND');
  });
});
