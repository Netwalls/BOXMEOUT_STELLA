import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';
import { initializeRedis, closeRedisConnection } from '../src/config/redis.js';

describe('Deep Health Check Endpoint', () => {
  beforeAll(async () => {
    // Initialize Redis for tests
    try {
      await initializeRedis();
    } catch (error) {
      console.warn('Redis not available for tests');
    }
  });

  afterAll(async () => {
    await closeRedisConnection();
  });

  it('should return health status with all components', async () => {
    const response = await request(app).get('/api/health/deep');

    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(600);
    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptime');
    expect(response.body).toHaveProperty('service', 'boxmeout-backend');
    expect(response.body).toHaveProperty('components');
  });

  it('should check PostgreSQL component', async () => {
    const response = await request(app).get('/api/health/deep');

    expect(response.body.components).toHaveProperty('postgresql');
    expect(response.body.components.postgresql).toHaveProperty('status');
    expect(response.body.components.postgresql).toHaveProperty('connected');
    expect(['healthy', 'unhealthy']).toContain(
      response.body.components.postgresql.status
    );
  });

  it('should check Redis component', async () => {
    const response = await request(app).get('/api/health/deep');

    expect(response.body.components).toHaveProperty('redis');
    expect(response.body.components.redis).toHaveProperty('status');
    expect(response.body.components.redis).toHaveProperty('connected');
    expect(['healthy', 'unhealthy']).toContain(
      response.body.components.redis.status
    );
  });

  it('should check Soroban RPC component', async () => {
    const response = await request(app).get('/api/health/deep');

    expect(response.body.components).toHaveProperty('soroban_rpc');
    expect(response.body.components.soroban_rpc).toHaveProperty('status');
    expect(response.body.components.soroban_rpc).toHaveProperty('reachable');
    expect(['healthy', 'unhealthy', 'not_configured']).toContain(
      response.body.components.soroban_rpc.status
    );
  });

  it('should include response times for healthy components', async () => {
    const response = await request(app).get('/api/health/deep');

    const { postgresql, redis, soroban_rpc } = response.body.components;

    if (postgresql.status === 'healthy') {
      expect(postgresql).toHaveProperty('responseTime');
      expect(typeof postgresql.responseTime).toBe('number');
    }

    if (redis.status === 'healthy') {
      expect(redis).toHaveProperty('responseTime');
      expect(typeof redis.responseTime).toBe('number');
    }

    if (soroban_rpc.status === 'healthy') {
      expect(soroban_rpc).toHaveProperty('responseTime');
      expect(typeof soroban_rpc.responseTime).toBe('number');
    }
  });

  it('should include error messages for unhealthy components', async () => {
    const response = await request(app).get('/api/health/deep');

    const { postgresql, redis, soroban_rpc } = response.body.components;

    if (postgresql.status === 'unhealthy') {
      expect(postgresql).toHaveProperty('error');
      expect(typeof postgresql.error).toBe('string');
    }

    if (redis.status === 'unhealthy') {
      expect(redis).toHaveProperty('error');
      expect(typeof redis.error).toBe('string');
    }

    if (soroban_rpc.status === 'unhealthy') {
      expect(soroban_rpc).toHaveProperty('error');
      expect(typeof soroban_rpc.error).toBe('string');
    }
  });

  it('should return 200 when all components are healthy', async () => {
    const response = await request(app).get('/api/health/deep');

    if (response.body.status === 'healthy') {
      expect(response.status).toBe(200);
    }
  });

  it('should return 503 when any component is unhealthy', async () => {
    const response = await request(app).get('/api/health/deep');

    if (response.body.status === 'degraded') {
      expect(response.status).toBe(503);
    }
  });

  it('should include Soroban endpoint when configured', async () => {
    const response = await request(app).get('/api/health/deep');

    if (response.body.components.soroban_rpc.status !== 'not_configured') {
      expect(response.body.components.soroban_rpc).toHaveProperty('endpoint');
      expect(typeof response.body.components.soroban_rpc.endpoint).toBe(
        'string'
      );
    }
  });
});
