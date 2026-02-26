import { describe, it, expect } from 'vitest';
import {
  stripHtml,
  sanitizedString,
  stellarAddress,
  uuidParam,
  marketIdParam,
  challengeBody,
  loginBody,
  refreshBody,
  logoutBody,
  createMarketBody,
  createPoolBody,
  commitPredictionBody,
  revealPredictionBody,
  attestBody,
  distributeLeaderboardBody,
  distributeCreatorBody,
} from '../../src/schemas/validation.schemas';

// Valid Stellar public key for tests
const VALID_STELLAR_KEY =
  'GA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKXQ';
const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';

// Helper to create a future datetime string
function futureDate(hoursFromNow = 24): string {
  const d = new Date();
  d.setHours(d.getHours() + hoursFromNow);
  return d.toISOString();
}

function pastDate(hoursAgo = 24): string {
  const d = new Date();
  d.setHours(d.getHours() - hoursAgo);
  return d.toISOString();
}

// ─── Sanitization tests ──────────────────────────────────────────

describe('stripHtml', () => {
  it('should strip script tags and their content', () => {
    expect(stripHtml('<script>alert("xss")</script>')).toBe('');
    expect(stripHtml('hello<script>alert("xss")</script>world')).toBe(
      'helloworld'
    );
  });

  it('should strip HTML tags', () => {
    expect(stripHtml('<b>bold</b>')).toBe('bold');
    expect(stripHtml('<div class="x">content</div>')).toBe('content');
    expect(stripHtml('<img src="x" onerror="alert(1)">')).toBe('');
  });

  it('should strip HTML entities', () => {
    expect(stripHtml('&lt;script&gt;')).toBe('script');
    expect(stripHtml('&amp;')).toBe('');
    expect(stripHtml('&#39;')).toBe('');
    expect(stripHtml('&#x27;')).toBe('');
  });

  it('should leave normal text unchanged', () => {
    expect(stripHtml('Hello World')).toBe('Hello World');
    expect(stripHtml('A prediction market about boxing')).toBe(
      'A prediction market about boxing'
    );
  });
});

describe('sanitizedString', () => {
  const schema = sanitizedString(3, 50);

  it('should trim whitespace', () => {
    const result = schema.parse('  hello  ');
    expect(result).toBe('hello');
  });

  it('should strip XSS payloads', () => {
    const result = schema.parse('hello<script>alert("xss")</script>world');
    expect(result).toBe('helloworld');
  });

  it('should reject strings shorter than min after sanitization', () => {
    expect(() => schema.parse('<b>ab</b>')).toThrow();
  });

  it('should reject strings longer than max', () => {
    expect(() => schema.parse('a'.repeat(51))).toThrow();
  });

  it('should accept valid strings', () => {
    expect(schema.parse('Valid text')).toBe('Valid text');
  });
});

// ─── Auth schema tests ──────────────────────────────────────────

describe('Auth schemas', () => {
  describe('challengeBody', () => {
    it('should accept valid Stellar public key', () => {
      expect(() =>
        challengeBody.parse({ publicKey: VALID_STELLAR_KEY })
      ).not.toThrow();
    });

    it('should reject missing publicKey', () => {
      expect(() => challengeBody.parse({})).toThrow();
    });

    it('should reject invalid Stellar key - wrong prefix', () => {
      expect(() =>
        challengeBody.parse({
          publicKey: 'SA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKXQ',
        })
      ).toThrow();
    });

    it('should reject invalid Stellar key - wrong length', () => {
      expect(() => challengeBody.parse({ publicKey: 'GABCDEF' })).toThrow();
    });

    it('should reject lowercase Stellar key', () => {
      expect(() =>
        challengeBody.parse({
          publicKey: VALID_STELLAR_KEY.toLowerCase(),
        })
      ).toThrow();
    });
  });

  describe('loginBody', () => {
    it('should accept valid login data', () => {
      expect(() =>
        loginBody.parse({
          publicKey: VALID_STELLAR_KEY,
          signature: 'abc123',
          nonce: 'nonce123',
        })
      ).not.toThrow();
    });

    it('should reject missing publicKey', () => {
      expect(() =>
        loginBody.parse({ signature: 'abc', nonce: 'xyz' })
      ).toThrow();
    });

    it('should reject missing signature', () => {
      expect(() =>
        loginBody.parse({ publicKey: VALID_STELLAR_KEY, nonce: 'xyz' })
      ).toThrow();
    });

    it('should reject missing nonce', () => {
      expect(() =>
        loginBody.parse({
          publicKey: VALID_STELLAR_KEY,
          signature: 'abc',
        })
      ).toThrow();
    });

    it('should reject empty signature', () => {
      expect(() =>
        loginBody.parse({
          publicKey: VALID_STELLAR_KEY,
          signature: '',
          nonce: 'nonce',
        })
      ).toThrow();
    });

    it('should reject empty nonce', () => {
      expect(() =>
        loginBody.parse({
          publicKey: VALID_STELLAR_KEY,
          signature: 'sig',
          nonce: '',
        })
      ).toThrow();
    });
  });

  describe('refreshBody', () => {
    it('should accept valid refresh token', () => {
      expect(() =>
        refreshBody.parse({ refreshToken: 'some-token' })
      ).not.toThrow();
    });

    it('should reject missing refreshToken', () => {
      expect(() => refreshBody.parse({})).toThrow();
    });

    it('should reject empty refreshToken', () => {
      expect(() => refreshBody.parse({ refreshToken: '' })).toThrow();
    });
  });

  describe('logoutBody', () => {
    it('should accept valid refresh token', () => {
      expect(() =>
        logoutBody.parse({ refreshToken: 'some-token' })
      ).not.toThrow();
    });

    it('should reject missing refreshToken', () => {
      expect(() => logoutBody.parse({})).toThrow();
    });

    it('should reject empty refreshToken', () => {
      expect(() => logoutBody.parse({ refreshToken: '' })).toThrow();
    });
  });
});

// ─── Market schema tests ─────────────────────────────────────────

describe('Market schemas', () => {
  describe('createMarketBody', () => {
    const validMarket = {
      title: 'Will boxer A win the championship?',
      description:
        'This market resolves YES if boxer A wins the championship bout.',
      category: 'BOXING',
      outcomeA: 'Yes',
      outcomeB: 'No',
      closingAt: futureDate(48),
    };

    it('should accept valid market data', () => {
      expect(() => createMarketBody.parse(validMarket)).not.toThrow();
    });

    it('should reject title that is too short', () => {
      expect(() =>
        createMarketBody.parse({ ...validMarket, title: 'abc' })
      ).toThrow();
    });

    it('should reject title that is too long', () => {
      expect(() =>
        createMarketBody.parse({ ...validMarket, title: 'a'.repeat(201) })
      ).toThrow();
    });

    it('should reject description that is too short', () => {
      expect(() =>
        createMarketBody.parse({ ...validMarket, description: 'short' })
      ).toThrow();
    });

    it('should reject description that is too long', () => {
      expect(() =>
        createMarketBody.parse({
          ...validMarket,
          description: 'a'.repeat(5001),
        })
      ).toThrow();
    });

    it('should reject invalid category enum value', () => {
      expect(() =>
        createMarketBody.parse({ ...validMarket, category: 'INVALID' })
      ).toThrow();
    });

    it('should accept all valid category values', () => {
      const categories = [
        'WRESTLING',
        'BOXING',
        'MMA',
        'SPORTS',
        'POLITICAL',
        'CRYPTO',
        'ENTERTAINMENT',
      ];
      for (const category of categories) {
        expect(() =>
          createMarketBody.parse({ ...validMarket, category })
        ).not.toThrow();
      }
    });

    it('should reject closingAt in the past', () => {
      expect(() =>
        createMarketBody.parse({ ...validMarket, closingAt: pastDate(24) })
      ).toThrow();
    });

    it('should reject resolutionTime before closingAt', () => {
      const closing = futureDate(48);
      const resolution = futureDate(24); // before closing
      expect(() =>
        createMarketBody.parse({
          ...validMarket,
          closingAt: closing,
          resolutionTime: resolution,
        })
      ).toThrow();
    });

    it('should accept resolutionTime after closingAt', () => {
      const closing = futureDate(24);
      const resolution = futureDate(72);
      expect(() =>
        createMarketBody.parse({
          ...validMarket,
          closingAt: closing,
          resolutionTime: resolution,
        })
      ).not.toThrow();
    });

    it('should accept missing resolutionTime (optional)', () => {
      const { resolutionTime, ...withoutResolution } = validMarket;
      expect(() => createMarketBody.parse(withoutResolution)).not.toThrow();
    });

    it('should strip XSS from title', () => {
      const result = createMarketBody.parse({
        ...validMarket,
        title: 'Will boxer<script>alert("xss")</script> A win?',
      });
      expect(result.title).toBe('Will boxer A win?');
    });

    it('should strip HTML from description', () => {
      const result = createMarketBody.parse({
        ...validMarket,
        description: 'This <b>market</b> resolves YES if boxer A wins.',
      });
      expect(result.description).toBe(
        'This market resolves YES if boxer A wins.'
      );
    });

    it('should strip HTML from outcome labels', () => {
      const result = createMarketBody.parse({
        ...validMarket,
        outcomeA: '<em>Yes</em>',
        outcomeB: '<strong>No</strong>',
      });
      expect(result.outcomeA).toBe('Yes');
      expect(result.outcomeB).toBe('No');
    });
  });

  describe('createPoolBody', () => {
    it('should accept valid pool data', () => {
      expect(() =>
        createPoolBody.parse({ initialLiquidity: '1000' })
      ).not.toThrow();
    });

    it('should reject zero liquidity', () => {
      expect(() => createPoolBody.parse({ initialLiquidity: '0' })).toThrow();
    });

    it('should reject non-numeric string', () => {
      expect(() => createPoolBody.parse({ initialLiquidity: 'abc' })).toThrow();
    });

    it('should reject decimal values', () => {
      expect(() =>
        createPoolBody.parse({ initialLiquidity: '100.5' })
      ).toThrow();
    });
  });
});

// ─── Prediction schema tests ─────────────────────────────────────

describe('Prediction schemas', () => {
  describe('commitPredictionBody', () => {
    it('should accept valid prediction (outcome 0)', () => {
      expect(() =>
        commitPredictionBody.parse({
          predictedOutcome: 0,
          amountUsdc: '100',
        })
      ).not.toThrow();
    });

    it('should accept valid prediction (outcome 1)', () => {
      expect(() =>
        commitPredictionBody.parse({
          predictedOutcome: 1,
          amountUsdc: '50.50',
        })
      ).not.toThrow();
    });

    it('should reject predictedOutcome of 2', () => {
      expect(() =>
        commitPredictionBody.parse({
          predictedOutcome: 2,
          amountUsdc: '100',
        })
      ).toThrow();
    });

    it('should reject predictedOutcome of -1', () => {
      expect(() =>
        commitPredictionBody.parse({
          predictedOutcome: -1,
          amountUsdc: '100',
        })
      ).toThrow();
    });

    it('should reject non-integer predictedOutcome (0.5)', () => {
      expect(() =>
        commitPredictionBody.parse({
          predictedOutcome: 0.5,
          amountUsdc: '100',
        })
      ).toThrow();
    });

    it('should reject string predictedOutcome', () => {
      expect(() =>
        commitPredictionBody.parse({
          predictedOutcome: '0',
          amountUsdc: '100',
        })
      ).toThrow();
    });

    it('should reject amountUsdc below minimum (0)', () => {
      expect(() =>
        commitPredictionBody.parse({
          predictedOutcome: 0,
          amountUsdc: '0',
        })
      ).toThrow();
    });

    it('should reject amountUsdc above maximum (> 1,000,000)', () => {
      expect(() =>
        commitPredictionBody.parse({
          predictedOutcome: 0,
          amountUsdc: '1000001',
        })
      ).toThrow();
    });

    it('should accept amountUsdc at minimum (1)', () => {
      expect(() =>
        commitPredictionBody.parse({
          predictedOutcome: 0,
          amountUsdc: '1',
        })
      ).not.toThrow();
    });

    it('should accept amountUsdc at maximum (1,000,000)', () => {
      expect(() =>
        commitPredictionBody.parse({
          predictedOutcome: 0,
          amountUsdc: '1000000',
        })
      ).not.toThrow();
    });

    it('should accept up to 6 decimal places', () => {
      expect(() =>
        commitPredictionBody.parse({
          predictedOutcome: 0,
          amountUsdc: '100.123456',
        })
      ).not.toThrow();
    });

    it('should reject more than 6 decimal places', () => {
      expect(() =>
        commitPredictionBody.parse({
          predictedOutcome: 0,
          amountUsdc: '100.1234567',
        })
      ).toThrow();
    });

    it('should reject negative amountUsdc', () => {
      expect(() =>
        commitPredictionBody.parse({
          predictedOutcome: 0,
          amountUsdc: '-100',
        })
      ).toThrow();
    });
  });

  describe('revealPredictionBody', () => {
    it('should accept valid UUID', () => {
      expect(() =>
        revealPredictionBody.parse({ predictionId: VALID_UUID })
      ).not.toThrow();
    });

    it('should reject invalid UUID', () => {
      expect(() =>
        revealPredictionBody.parse({ predictionId: 'not-a-uuid' })
      ).toThrow();
    });

    it('should reject missing predictionId', () => {
      expect(() => revealPredictionBody.parse({})).toThrow();
    });
  });
});

// ─── Oracle schema tests ─────────────────────────────────────────

describe('Oracle schemas', () => {
  describe('attestBody', () => {
    it('should accept outcome 0', () => {
      expect(() => attestBody.parse({ outcome: 0 })).not.toThrow();
    });

    it('should accept outcome 1', () => {
      expect(() => attestBody.parse({ outcome: 1 })).not.toThrow();
    });

    it('should reject outcome 2', () => {
      expect(() => attestBody.parse({ outcome: 2 })).toThrow();
    });

    it('should reject outcome -1', () => {
      expect(() => attestBody.parse({ outcome: -1 })).toThrow();
    });

    it('should reject non-integer outcome (0.5)', () => {
      expect(() => attestBody.parse({ outcome: 0.5 })).toThrow();
    });

    it('should reject string outcome', () => {
      expect(() => attestBody.parse({ outcome: '0' })).toThrow();
    });

    it('should reject missing outcome', () => {
      expect(() => attestBody.parse({})).toThrow();
    });
  });
});

// ─── Treasury schema tests ───────────────────────────────────────

describe('Treasury schemas', () => {
  describe('distributeLeaderboardBody', () => {
    it('should accept valid distribution with one recipient', () => {
      expect(() =>
        distributeLeaderboardBody.parse({
          recipients: [{ address: VALID_STELLAR_KEY, amount: '1000' }],
        })
      ).not.toThrow();
    });

    it('should accept valid distribution with multiple recipients', () => {
      expect(() =>
        distributeLeaderboardBody.parse({
          recipients: [
            { address: VALID_STELLAR_KEY, amount: '1000' },
            { address: VALID_STELLAR_KEY, amount: '500' },
          ],
        })
      ).not.toThrow();
    });

    it('should reject empty recipients array', () => {
      expect(() =>
        distributeLeaderboardBody.parse({ recipients: [] })
      ).toThrow();
    });

    it('should reject more than 100 recipients', () => {
      const recipients = Array.from({ length: 101 }, () => ({
        address: VALID_STELLAR_KEY,
        amount: '100',
      }));
      expect(() => distributeLeaderboardBody.parse({ recipients })).toThrow();
    });

    it('should accept exactly 100 recipients', () => {
      const recipients = Array.from({ length: 100 }, () => ({
        address: VALID_STELLAR_KEY,
        amount: '100',
      }));
      expect(() =>
        distributeLeaderboardBody.parse({ recipients })
      ).not.toThrow();
    });

    it('should reject invalid Stellar address in recipients', () => {
      expect(() =>
        distributeLeaderboardBody.parse({
          recipients: [{ address: 'invalid-address', amount: '1000' }],
        })
      ).toThrow();
    });

    it('should reject zero amount', () => {
      expect(() =>
        distributeLeaderboardBody.parse({
          recipients: [{ address: VALID_STELLAR_KEY, amount: '0' }],
        })
      ).toThrow();
    });

    it('should reject non-numeric amount', () => {
      expect(() =>
        distributeLeaderboardBody.parse({
          recipients: [{ address: VALID_STELLAR_KEY, amount: 'abc' }],
        })
      ).toThrow();
    });
  });

  describe('distributeCreatorBody', () => {
    it('should accept valid creator distribution', () => {
      expect(() =>
        distributeCreatorBody.parse({
          marketId: VALID_UUID,
          creatorAddress: VALID_STELLAR_KEY,
          amount: '5000',
        })
      ).not.toThrow();
    });

    it('should reject invalid marketId', () => {
      expect(() =>
        distributeCreatorBody.parse({
          marketId: 'not-a-uuid',
          creatorAddress: VALID_STELLAR_KEY,
          amount: '5000',
        })
      ).toThrow();
    });

    it('should reject invalid creatorAddress', () => {
      expect(() =>
        distributeCreatorBody.parse({
          marketId: VALID_UUID,
          creatorAddress: 'invalid',
          amount: '5000',
        })
      ).toThrow();
    });

    it('should reject zero amount', () => {
      expect(() =>
        distributeCreatorBody.parse({
          marketId: VALID_UUID,
          creatorAddress: VALID_STELLAR_KEY,
          amount: '0',
        })
      ).toThrow();
    });

    it('should reject non-numeric amount', () => {
      expect(() =>
        distributeCreatorBody.parse({
          marketId: VALID_UUID,
          creatorAddress: VALID_STELLAR_KEY,
          amount: 'abc',
        })
      ).toThrow();
    });
  });
});

// ─── Shared primitives tests ─────────────────────────────────────

describe('Shared primitives', () => {
  describe('stellarAddress', () => {
    it('should accept valid Stellar public key', () => {
      expect(() => stellarAddress.parse(VALID_STELLAR_KEY)).not.toThrow();
    });

    it('should reject key with wrong prefix', () => {
      expect(() =>
        stellarAddress.parse(
          'SA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKXQ'
        )
      ).toThrow();
    });

    it('should reject key that is too short', () => {
      expect(() => stellarAddress.parse('GABCDEF')).toThrow();
    });

    it('should reject key with lowercase characters', () => {
      expect(() =>
        stellarAddress.parse(VALID_STELLAR_KEY.toLowerCase())
      ).toThrow();
    });

    it('should reject empty string', () => {
      expect(() => stellarAddress.parse('')).toThrow();
    });
  });

  describe('uuidParam', () => {
    it('should accept valid UUID', () => {
      expect(() => uuidParam.parse({ id: VALID_UUID })).not.toThrow();
    });

    it('should reject invalid UUID', () => {
      expect(() => uuidParam.parse({ id: 'not-a-uuid' })).toThrow();
    });

    it('should reject missing id', () => {
      expect(() => uuidParam.parse({})).toThrow();
    });
  });

  describe('marketIdParam', () => {
    it('should accept valid UUID', () => {
      expect(() => marketIdParam.parse({ marketId: VALID_UUID })).not.toThrow();
    });

    it('should reject invalid UUID', () => {
      expect(() => marketIdParam.parse({ marketId: 'not-valid' })).toThrow();
    });
  });
});
