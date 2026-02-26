import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { validate } from '../../src/middleware/validation.middleware';
import { errorHandler, ApiError } from '../../src/middleware/error.middleware';
import {
  challengeBody,
  createMarketBody,
} from '../../src/schemas/validation.schemas';

describe('Validation and Error Handling Integration', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  it('should process valid request through complete middleware chain', async () => {
    app.post('/api/test', validate({ body: challengeBody }), (req, res) => {
      res.json({
        success: true,
        data: {
          publicKey: req.body.publicKey,
        },
      });
    });
    app.use(errorHandler);

    const response = await request(app).post('/api/test').send({
      publicKey: 'GA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKXQ',
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.publicKey).toBe(
      'GA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKXQ'
    );
  });

  it('should handle validation error with custom business logic', async () => {
    app.post(
      '/api/market',
      validate({ body: createMarketBody }),
      (req, res, next) => {
        // Business logic after validation
        if (req.body.title.toLowerCase().includes('spam')) {
          return next(
            new ApiError(
              422,
              'SPAM_DETECTED',
              'Market title contains spam content'
            )
          );
        }
        res.json({ success: true, data: req.body });
      }
    );
    app.use(errorHandler);

    // Future closing date for valid market data
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const closingAt = futureDate.toISOString();

    // Use a title that passes validation but contains "spam"
    const spamResponse = await request(app).post('/api/market').send({
      title: 'Is this product considered spam?',
      description: 'A valid description that passes all validation checks',
      category: 'CRYPTO',
      outcomeA: 'Yes',
      outcomeB: 'No',
      closingAt,
    });

    // Should be 422 (business logic rejection) not 400 (validation error)
    expect(spamResponse.status).toBe(422);
    expect(spamResponse.body.error.code).toBe('SPAM_DETECTED');

    // Valid request that passes all checks
    const validResponse = await request(app).post('/api/market').send({
      title: 'Legitimate market question here',
      description: 'A valid description that passes all validation checks',
      category: 'CRYPTO',
      outcomeA: 'Yes',
      outcomeB: 'No',
      closingAt,
    });

    expect(validResponse.status).toBe(200);
    expect(validResponse.body.success).toBe(true);
  });
});
