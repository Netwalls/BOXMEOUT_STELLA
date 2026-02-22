// backend/src/middleware/__tests__/rateLimit.middleware.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { Request, Response } from 'express';
import {
  authRateLimiter,
  predictionRateLimiter,
  tradeRateLimiter,
  challengeRateLimiter,
} from '../rateLimit.middleware.js';
import { AuthenticatedRequest } from '../../types/auth.types.js';

// Mock Redis client
vi.mock('../../config/redis.js', () => ({
  getRedisClient: vi.fn(() => ({
    call: vi.fn(),
  })),
}));

describe('Rate Limit Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('authRateLimiter', () => {
    it('should limit auth requests to 5 per minute per wallet', async () => {
      app.post('/auth', authRateLimiter, (req: Request, res: Response) => {
        res.json({ success: true });
      });

      const publicKey = 'GTEST123456789';

      // Make 5 successful requests
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post('/auth')
          .send({ publicKey })
          .expect(200);

        expect(response.body.success).toBe(true);
      }

      // 6th request should be rate limited
      const response = await request(app)
        .post('/auth')
        .send({ publicKey })
        .expect(429);

      expect(response.body.error.code).toBe('RATE_LIMITED');
      expect(response.body.retryAfter).toBeDefined();
    });

    it('should include Retry-After header in rate limit response', async () => {
      app.post('/auth', authRateLimiter, (req: Request, res: Response) => {
        res.json({ success: true });
      });

      const publicKey = 'GTEST123456789';

      // Exhaust rate limit
      for (let i = 0; i < 5; i++) {
        await request(app).post('/auth').send({ publicKey });
      }

      // Check rate limited response
      const response = await request(app)
        .post('/auth')
        .send({ publicKey })
        .expect(429);

      expect(response.headers['retry-after']).toBeDefined();
      expect(response.body.retryAfter).toBeDefined();
    });
  });

  describe('predictionRateLimiter', () => {
    it('should limit prediction requests to 10 per minute per wallet', async () => {
      // Mock authenticated middleware
      app.use((req: Request, res: Response, next) => {
        (req as AuthenticatedRequest).user = {
          userId: 'user123',
          publicKey: 'GTEST123456789',
          tier: 'FREE',
        };
        next();
      });

      app.post(
        '/predictions',
        predictionRateLimiter,
        (req: Request, res: Response) => {
          res.json({ success: true });
        }
      );

      // Make 10 successful requests
      for (let i = 0; i < 10; i++) {
        const response = await request(app).post('/predictions').expect(200);
        expect(response.body.success).toBe(true);
      }

      // 11th request should be rate limited
      const response = await request(app).post('/predictions').expect(429);

      expect(response.body.error.code).toBe('RATE_LIMITED');
      expect(response.body.error.message).toContain('prediction');
    });

    it('should use wallet address as key for rate limiting', async () => {
      app.use((req: Request, res: Response, next) => {
        const publicKey = req.headers['x-wallet'] as string;
        (req as AuthenticatedRequest).user = {
          userId: 'user123',
          publicKey: publicKey || 'GDEFAULT',
          tier: 'FREE',
        };
        next();
      });

      app.post(
        '/predictions',
        predictionRateLimiter,
        (req: Request, res: Response) => {
          res.json({ success: true });
        }
      );

      // Wallet 1 makes 10 requests
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/predictions')
          .set('x-wallet', 'GWALLET1')
          .expect(200);
      }

      // Wallet 1 is rate limited
      await request(app)
        .post('/predictions')
        .set('x-wallet', 'GWALLET1')
        .expect(429);

      // Wallet 2 can still make requests
      const response = await request(app)
        .post('/predictions')
        .set('x-wallet', 'GWALLET2')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('tradeRateLimiter', () => {
    it('should limit trade requests to 30 per minute per wallet', async () => {
      app.use((req: Request, res: Response, next) => {
        (req as AuthenticatedRequest).user = {
          userId: 'user123',
          publicKey: 'GTEST123456789',
          tier: 'FREE',
        };
        next();
      });

      app.post('/trades', tradeRateLimiter, (req: Request, res: Response) => {
        res.json({ success: true });
      });

      // Make 30 successful requests
      for (let i = 0; i < 30; i++) {
        const response = await request(app).post('/trades').expect(200);
        expect(response.body.success).toBe(true);
      }

      // 31st request should be rate limited
      const response = await request(app).post('/trades').expect(429);

      expect(response.body.error.code).toBe('RATE_LIMITED');
      expect(response.body.error.message).toContain('trade');
    });
  });

  describe('challengeRateLimiter', () => {
    it('should limit challenge requests to 5 per minute per public key', async () => {
      app.post(
        '/challenge',
        challengeRateLimiter,
        (req: Request, res: Response) => {
          res.json({ success: true });
        }
      );

      const publicKey = 'GTEST123456789';

      // Make 5 successful requests
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post('/challenge')
          .send({ publicKey })
          .expect(200);

        expect(response.body.success).toBe(true);
      }

      // 6th request should be rate limited
      const response = await request(app)
        .post('/challenge')
        .send({ publicKey })
        .expect(429);

      expect(response.body.error.code).toBe('RATE_LIMITED');
    });
  });

  describe('Rate limit headers', () => {
    it('should include standard rate limit headers', async () => {
      app.post('/auth', authRateLimiter, (req: Request, res: Response) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .post('/auth')
        .send({ publicKey: 'GTEST' })
        .expect(200);

      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers['ratelimit-remaining']).toBeDefined();
      expect(response.headers['ratelimit-reset']).toBeDefined();
    });
  });
});
