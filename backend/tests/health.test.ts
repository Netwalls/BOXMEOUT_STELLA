import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mock routes to prevent loading of deep dependencies (like Stellar SDK)
vi.mock('../src/routes/auth.routes.js', () => ({
  default: (req: any, res: any, next: any) => next(),
}));
vi.mock('../src/routes/markets.routes.js', () => ({
  default: (req: any, res: any, next: any) => next(),
}));
vi.mock('../src/routes/predictions.js', () => ({
  default: (req: any, res: any, next: any) => next(),
}));

import app from '../src/index.js';
import * as prismaModule from '../src/database/prisma.js';
import * as redisModule from '../src/config/redis.js';

vi.mock('../src/database/prisma.js', async () => {
  const actual = (await vi.importActual('../src/database/prisma.js')) as any;
  return {
    ...actual,
    checkDatabaseConnection: vi.fn(),
  };
});

vi.mock('../src/config/redis.js', async () => {
  const actual = (await vi.importActual('../src/config/redis.js')) as any;
  return {
    ...actual,
    isRedisHealthy: vi.fn(),
    getRedisStatus: vi.fn(),
  };
});

describe('Health Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks
    (redisModule.isRedisHealthy as any).mockResolvedValue(true);
    (redisModule.getRedisStatus as any).mockReturnValue({
      connected: true,
      status: 'ready',
    });
  });

  describe('GET /api/health', () => {
    it('should return 200 and healthy status', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/ready', () => {
    it('should return 200 when services are connected', async () => {
      (prismaModule.checkDatabaseConnection as any).mockResolvedValue(true);

      const response = await request(app).get('/api/ready');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ready');
      expect(response.body.services.database).toHaveProperty('connected', true);
      expect(response.body.services.redis).toHaveProperty('connected', true);
    });

    it('should return 503 when database is disconnected', async () => {
      (prismaModule.checkDatabaseConnection as any).mockResolvedValue(false);

      const response = await request(app).get('/api/ready');

      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('status', 'not_ready');
      expect(response.body.services.database).toHaveProperty(
        'connected',
        false
      );
    });

    it('should return 503 when redis is disconnected', async () => {
      (prismaModule.checkDatabaseConnection as any).mockResolvedValue(true);
      (redisModule.isRedisHealthy as any).mockResolvedValue(false);
      (redisModule.getRedisStatus as any).mockReturnValue({
        connected: false,
        status: 'error',
      });

      const response = await request(app).get('/api/ready');

      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('status', 'not_ready');
      expect(response.body.services.redis).toHaveProperty('connected', false);
    });
  });

  describe('GET /metrics', () => {
    it('should return Prometheus metrics', async () => {
      const response = await request(app).get('/metrics');

      expect(response.status).toBe(200);
      expect(response.header['content-type']).toContain('text/plain');
      // Check for some common Prometheus metric names
      expect(response.text).toContain('process_cpu_user_seconds_total');
      expect(response.text).toContain('nodejs_version_info');
    });
  });
});
