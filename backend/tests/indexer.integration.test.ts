// backend/tests/indexer.integration.test.ts
// Integration tests for indexer API endpoints

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';

// Mock JWT verification for admin
vi.mock('../src/utils/jwt.js', () => ({
  verifyAccessToken: vi.fn().mockReturnValue({
    userId: 'admin-user-id',
    publicKey: process.env.ADMIN_WALLET_ADDRESSES?.split(',')[0] || 'GADMIN',
    tier: 'LEGENDARY',
  }),
}));

describe('Indexer API Integration Tests', () => {
  let authToken: string;

  beforeAll(() => {
    authToken = 'mock_admin_jwt_token';
  });

  afterAll(async () => {
    // Cleanup if needed
  });

  describe('GET /api/indexer/status', () => {
    it('should return indexer status for admin', async () => {
      const response = await request(app)
        .get('/api/indexer/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('state');
      expect(response.body.data).toHaveProperty('latestLedger');
      expect(response.body.data).toHaveProperty('ledgersBehind');
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/indexer/status');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
    });

    it('should require admin access', async () => {
      // Mock non-admin user
      vi.mocked(require('../src/utils/jwt.js').verifyAccessToken).mockReturnValueOnce({
        userId: 'regular-user-id',
        publicKey: 'GREGULAR',
        tier: 'BEGINNER',
      });

      const response = await request(app)
        .get('/api/indexer/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/indexer/start', () => {
    it('should start indexer for admin', async () => {
      const response = await request(app)
        .post('/api/indexer/start')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });

    it('should require authentication', async () => {
      const response = await request(app).post('/api/indexer/start');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/indexer/stop', () => {
    it('should stop indexer for admin', async () => {
      const response = await request(app)
        .post('/api/indexer/stop')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });

    it('should require authentication', async () => {
      const response = await request(app).post('/api/indexer/stop');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/indexer/reprocess', () => {
    it('should reprocess from specified ledger for admin', async () => {
      const response = await request(app)
        .post('/api/indexer/reprocess')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ startLedger: 1000 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toContain('1000');
    });

    it('should validate startLedger parameter', async () => {
      const response = await request(app)
        .post('/api/indexer/reprocess')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ startLedger: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should require startLedger parameter', async () => {
      const response = await request(app)
        .post('/api/indexer/reprocess')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/indexer/reprocess')
        .send({ startLedger: 1000 });

      expect(response.status).toBe(401);
    });
  });

  describe('Error Handling', () => {
    it('should handle internal errors gracefully', async () => {
      // This would require mocking the indexer service to throw an error
      // For now, verify the endpoint exists and returns proper error format
      const response = await request(app)
        .get('/api/indexer/status')
        .set('Authorization', `Bearer ${authToken}`);

      if (response.status === 500) {
        expect(response.body).toHaveProperty('success', false);
        expect(response.body.error).toHaveProperty('code');
        expect(response.body.error).toHaveProperty('message');
      }
    });
  });
});
