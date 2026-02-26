import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { validate } from '../../src/middleware/validation.middleware';
import { errorHandler } from '../../src/middleware/error.middleware';
import {
  challengeBody,
  loginBody,
  uuidParam,
  stellarAddress,
  attestBody,
} from '../../src/schemas/validation.schemas';
import { z } from 'zod';

describe('Validation Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('validate() - Body Validation', () => {
    it('should accept valid challenge data', async () => {
      app.post('/challenge', validate({ body: challengeBody }), (req, res) => {
        res.json({ success: true, data: req.body });
      });
      app.use(errorHandler);

      const response = await request(app).post('/challenge').send({
        publicKey: 'GA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKXQ',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.publicKey).toBe(
        'GA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKXQ'
      );
    });

    it('should reject invalid Stellar public key', async () => {
      app.post('/challenge', validate({ body: challengeBody }), (req, res) =>
        res.json({ success: true })
      );
      app.use(errorHandler);

      const response = await request(app).post('/challenge').send({
        publicKey: 'invalid-key',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details[0].field).toBe('publicKey');
    });

    it('should reject missing required fields', async () => {
      app.post('/challenge', validate({ body: challengeBody }), (req, res) =>
        res.json({ success: true })
      );
      app.use(errorHandler);

      const response = await request(app).post('/challenge').send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should accept valid login data', async () => {
      app.post('/login', validate({ body: loginBody }), (req, res) => {
        res.json({ success: true, data: req.body });
      });
      app.use(errorHandler);

      const response = await request(app).post('/login').send({
        publicKey: 'GA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKXQ',
        signature: 'test-signature',
        nonce: 'test-nonce',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject empty signature in login', async () => {
      app.post('/login', validate({ body: loginBody }), (req, res) =>
        res.json({ success: true })
      );
      app.use(errorHandler);

      const response = await request(app).post('/login').send({
        publicKey: 'GA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKXQ',
        signature: '',
        nonce: 'test-nonce',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.details[0].field).toBe('signature');
    });
  });

  describe('validate() - Body Validation with attestBody', () => {
    it('should accept valid attest data', async () => {
      app.post('/attest', validate({ body: attestBody }), (req, res) => {
        res.json({ success: true, data: req.body });
      });
      app.use(errorHandler);

      const response = await request(app).post('/attest').send({ outcome: 1 });

      expect(response.status).toBe(200);
      expect(response.body.data.outcome).toBe(1);
    });

    it('should reject invalid outcome value', async () => {
      app.post('/attest', validate({ body: attestBody }), (req, res) =>
        res.json({ success: true })
      );
      app.use(errorHandler);

      const response = await request(app).post('/attest').send({ outcome: 5 });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('validate() - Params Validation', () => {
    it('should validate UUID in URL parameters', async () => {
      app.get('/users/:id', validate({ params: uuidParam }), (req, res) => {
        res.json({ success: true, data: req.params });
      });
      app.use(errorHandler);

      const response = await request(app).get(
        '/users/123e4567-e89b-12d3-a456-426614174000'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(
        '123e4567-e89b-12d3-a456-426614174000'
      );
    });

    it('should reject invalid UUID', async () => {
      app.get('/users/:id', validate({ params: uuidParam }), (req, res) =>
        res.json({ success: true })
      );
      app.use(errorHandler);

      const response = await request(app).get('/users/not-a-uuid');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('validate() - Combined Body + Params', () => {
    it('should validate both params and body simultaneously', async () => {
      app.post(
        '/markets/:id/attest',
        validate({ params: uuidParam, body: attestBody }),
        (req, res) => {
          res.json({ success: true, params: req.params, body: req.body });
        }
      );
      app.use(errorHandler);

      const response = await request(app)
        .post('/markets/123e4567-e89b-12d3-a456-426614174000/attest')
        .send({ outcome: 0 });

      expect(response.status).toBe(200);
      expect(response.body.params.id).toBe(
        '123e4567-e89b-12d3-a456-426614174000'
      );
      expect(response.body.body.outcome).toBe(0);
    });

    it('should reject if params are invalid even when body is valid', async () => {
      app.post(
        '/markets/:id/attest',
        validate({ params: uuidParam, body: attestBody }),
        (req, res) => res.json({ success: true })
      );
      app.use(errorHandler);

      const response = await request(app)
        .post('/markets/not-a-uuid/attest')
        .send({ outcome: 0 });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('validate() - Stellar address', () => {
    it('should accept valid Stellar address in body', async () => {
      const stellarAddressBody = z.object({ address: stellarAddress });
      app.post(
        '/verify',
        validate({ body: stellarAddressBody }),
        (req, res) => {
          res.json({ success: true, data: req.body });
        }
      );
      app.use(errorHandler);

      const response = await request(app).post('/verify').send({
        address: 'GA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKXQ',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.address).toBe(
        'GA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKXQ'
      );
    });

    it('should reject invalid Stellar address', async () => {
      const stellarAddressBody = z.object({ address: stellarAddress });
      app.post('/verify', validate({ body: stellarAddressBody }), (req, res) =>
        res.json({ success: true })
      );
      app.use(errorHandler);

      const response = await request(app).post('/verify').send({
        address: 'not-a-stellar-address',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
