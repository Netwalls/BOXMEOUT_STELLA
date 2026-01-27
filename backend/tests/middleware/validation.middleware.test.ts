import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { validate, schemas } from '../../src/middleware/validation.middleware';
import { errorHandler } from '../../src/middleware/error.middleware';
import { z } from 'zod';

describe('Validation Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('validate() - Body Validation', () => {
    it('should accept valid registration data', async () => {
      app.post('/register',
        validate({ body: schemas.register }),
        (req, res) => {
          res.json({ success: true, data: req.body });
        }
      );
      app.use(errorHandler);

      const response = await request(app)
        .post('/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          username: 'testuser_123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe('test@example.com');
    });

    it('should reject invalid email format', async () => {
      app.post('/register',
        validate({ body: schemas.register }),
        (req, res) => res.json({ success: true })
      );
      app.use(errorHandler);

      const response = await request(app)
        .post('/register')
        .send({
          email: 'invalid-email',
          password: 'Password123!',
          username: 'testuser'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details[0].field).toBe('email');
      expect(response.body.error.details[0].message).toContain('email');
    });

    it('should reject password that is too short', async () => {
      app.post('/register',
        validate({ body: schemas.register }),
        (req, res) => res.json({ success: true })
      );
      app.use(errorHandler);

      const response = await request(app)
        .post('/register')
        .send({
          email: 'test@example.com',
          password: 'short',
          username: 'testuser'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.details[0].field).toBe('password');
      expect(response.body.error.details[0].message).toContain('8');
    });

    it('should accept optional wallet address', async () => {
      app.post('/register',
        validate({ body: schemas.register }),
        (req, res) => {
          res.json({ success: true, data: req.body });
        }
      );
      app.use(errorHandler);

      const response = await request(app)
        .post('/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          username: 'testuser',
          walletAddress: 'GA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKXQ'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.walletAddress).toBe('GA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKXQ');
    });
  });

  describe('validate() - Query Validation', () => {
    it('should validate pagination query parameters', async () => {
      app.get('/markets',
        validate({ query: schemas.pagination }),
        (req, res) => {
          res.json({ success: true, data: req.query });
        }
      );
      app.use(errorHandler);

      const response = await request(app)
        .get('/markets')
        .query({ page: '2', limit: '50', order: 'asc' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.page).toBe(2);
      expect(response.body.data.limit).toBe(50);
      expect(response.body.data.order).toBe('asc');
    });

    it('should use default values for missing pagination params', async () => {
      app.get('/markets',
        validate({ query: schemas.pagination }),
        (req, res) => {
          res.json({ success: true, data: req.query });
        }
      );
      app.use(errorHandler);

      const response = await request(app).get('/markets');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.page).toBe(1);
      expect(response.body.data.limit).toBe(20);
      expect(response.body.data.order).toBe('desc');
    });
  });

  describe('validate() - Params Validation', () => {
    it('should validate UUID in URL parameters', async () => {
      app.get('/users/:id',
        validate({ params: schemas.idParam }),
        (req, res) => {
          res.json({ success: true, data: req.params });
        }
      );
      app.use(errorHandler);

      const response = await request(app)
        .get('/users/123e4567-e89b-12d3-a456-426614174000');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('123e4567-e89b-12d3-a456-426614174000');
    });

    it('should reject invalid UUID', async () => {
      app.get('/users/:id',
        validate({ params: schemas.idParam }),
        (req, res) => res.json({ success: true })
      );
      app.use(errorHandler);

      const response = await request(app).get('/users/not-a-uuid');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('schemas object', () => {
    it('should contain all expected schemas', () => {
      expect(schemas).toHaveProperty('register');
      expect(schemas).toHaveProperty('login');
      expect(schemas).toHaveProperty('createMarket');
      expect(schemas).toHaveProperty('pagination');
      expect(schemas).toHaveProperty('idParam');
      expect(schemas).toHaveProperty('stellarAddress');
      expect(schemas).toHaveProperty('walletChallenge');
    });

    describe('login schema', () => {
      it('should accept valid login data', () => {
        const validData = {
          email: 'user@example.com',
          password: 'password123'
        };

        expect(() => schemas.login.parse(validData)).not.toThrow();
      });

      it('should reject invalid email', () => {
        const invalidData = {
          email: 'invalid-email',
          password: 'password123'
        };

        expect(() => schemas.login.parse(invalidData)).toThrow();
      });

      it('should reject empty password', () => {
        const invalidData = {
          email: 'user@example.com',
          password: ''
        };

        expect(() => schemas.login.parse(invalidData)).toThrow();
      });
    });

    describe('pagination schema', () => {
      it('should transform string numbers to numbers', () => {
        const data = {
          page: '3',
          limit: '50'
        };

        const result = schemas.pagination.parse(data);
        expect(result.page).toBe(3);
        expect(result.limit).toBe(50);
      });

      it('should provide default values', () => {
        const data = {};
        const result = schemas.pagination.parse(data);

        expect(result.page).toBe(1);
        expect(result.limit).toBe(20);
        expect(result.order).toBe('desc');
      });
    });

    describe('stellarAddress schema', () => {
      it('should accept valid Stellar address', () => {
        const validAddress = {
          address: 'GA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKXQ'
        };

        expect(() => schemas.stellarAddress.parse(validAddress)).not.toThrow();
      });

      it('should reject invalid Stellar address', () => {
        const invalidAddress = {
          address: 'not-a-stellar-address'
        };

        expect(() => schemas.stellarAddress.parse(invalidAddress)).toThrow();
      });
    });
  });
});