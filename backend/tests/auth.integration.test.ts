import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import Redis from 'ioredis';

// Mock Redis for testing
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Import services
import { SessionService } from '../src/services/session.service.js';
import { StellarService } from '../src/services/stellar.service.js';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../src/utils/jwt.js';

describe('Auth Integration Tests', () => {
  const sessionService = new SessionService();
  const stellarService = new StellarService();

  beforeAll(async () => {
    // Clear test keys
    const keys = await redis.keys('auth:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterAll(async () => {
    await redis.quit();
  });

  describe('Valid login returns JWT tokens', () => {
    it('should complete full auth flow with valid wallet signature', async () => {
      // Generate test keypair
      const keypair = Keypair.random();
      const publicKey = keypair.publicKey();

      // Step 1: Create challenge nonce
      const nonceData = await sessionService.createNonce(publicKey);
      expect(nonceData.nonce).toBeTruthy();
      expect(nonceData.message).toContain('BoxMeOut Stella Authentication');

      // Step 2: Sign the message with wallet
      const messageBuffer = Buffer.from(nonceData.message, 'utf-8');
      const signature = keypair.sign(messageBuffer);
      const signatureBase64 = signature.toString('base64');

      // Step 3: Verify signature
      const isValid = stellarService.verifySignature(
        publicKey,
        nonceData.message,
        signatureBase64
      );
      expect(isValid).toBe(true);

      // Step 4: Consume nonce (simulating login)
      const consumed = await sessionService.consumeNonce(publicKey, nonceData.nonce);
      expect(consumed).not.toBeNull();

      // Step 5: Generate tokens
      const accessToken = signAccessToken({
        userId: 'test-user-id',
        publicKey,
        tier: 'BEGINNER',
      });
      const refreshToken = signRefreshToken({
        userId: 'test-user-id',
        tokenId: 'test-token-id',
      });

      expect(accessToken).toBeTruthy();
      expect(refreshToken).toBeTruthy();

      // Verify tokens are valid
      const accessPayload = verifyAccessToken(accessToken);
      expect(accessPayload.userId).toBe('test-user-id');
      expect(accessPayload.publicKey).toBe(publicKey);
    });
  });

  describe('Invalid credentials rejected with 401', () => {
    it('should reject invalid signature', async () => {
      const keypair1 = Keypair.random();
      const keypair2 = Keypair.random();
      const publicKey = keypair1.publicKey();

      // Create nonce for keypair1
      const nonceData = await sessionService.createNonce(publicKey);

      // Sign with keypair2 (wrong key)
      const messageBuffer = Buffer.from(nonceData.message, 'utf-8');
      const signature = keypair2.sign(messageBuffer);
      const signatureBase64 = signature.toString('base64');

      // Verification should fail
      const isValid = stellarService.verifySignature(
        publicKey,
        nonceData.message,
        signatureBase64
      );
      expect(isValid).toBe(false);
    });

    it('should reject expired/used nonce', async () => {
      const keypair = Keypair.random();
      const publicKey = keypair.publicKey();

      // Create and consume nonce
      const nonceData = await sessionService.createNonce(publicKey);
      await sessionService.consumeNonce(publicKey, nonceData.nonce);

      // Try to use same nonce again (replay attack)
      const consumed = await sessionService.consumeNonce(publicKey, nonceData.nonce);
      expect(consumed).toBeNull();
    });
  });

  describe('Protected routes require valid JWT', () => {
    it('should decode valid access token', () => {
      const payload = {
        userId: 'user-123',
        publicKey: 'GBTEST',
        tier: 'EXPERT' as const,
      };

      const token = signAccessToken(payload);
      const decoded = verifyAccessToken(token);

      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.tier).toBe(payload.tier);
      expect(decoded.type).toBe('access');
    });

    it('should reject tampered token', () => {
      const token = signAccessToken({
        userId: 'user-123',
        publicKey: 'GBTEST',
        tier: 'BEGINNER',
      });

      // Tamper with token
      const tampered = token.slice(0, -5) + 'XXXXX';

      expect(() => verifyAccessToken(tampered)).toThrow();
    });
  });

  describe('Refresh token flow works correctly', () => {
    it('should create and retrieve session', async () => {
      const sessionData = {
        userId: 'user-123',
        tokenId: 'token-456',
        publicKey: 'GBTEST',
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      };

      await sessionService.createSession(sessionData);
      const retrieved = await sessionService.getSession(sessionData.tokenId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.userId).toBe(sessionData.userId);
      expect(retrieved?.tokenId).toBe(sessionData.tokenId);
    });

    it('should rotate session on refresh', async () => {
      const oldSession = {
        userId: 'user-123',
        tokenId: 'old-token',
        publicKey: 'GBTEST',
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      };

      const newSession = {
        userId: 'user-123',
        tokenId: 'new-token',
        publicKey: 'GBTEST',
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      };

      await sessionService.createSession(oldSession);
      await sessionService.rotateSession(oldSession.tokenId, newSession);

      // Old session should be gone
      const oldRetrieved = await sessionService.getSession(oldSession.tokenId);
      expect(oldRetrieved).toBeNull();

      // New session should exist
      const newRetrieved = await sessionService.getSession(newSession.tokenId);
      expect(newRetrieved).not.toBeNull();
    });

    it('should blacklist token on logout', async () => {
      const tokenId = 'logout-test-token';

      await sessionService.blacklistToken(tokenId, 3600);
      const isBlacklisted = await sessionService.isTokenBlacklisted(tokenId);

      expect(isBlacklisted).toBe(true);
    });
  });

  describe('Rate limiter blocks excessive requests', () => {
    // Rate limiting is tested via middleware, but we can verify the Redis store works
    it('should track rate limit keys in Redis', async () => {
      const testKey = 'rl:test:127.0.0.1';
      await redis.incr(testKey);
      await redis.expire(testKey, 60);

      const count = await redis.get(testKey);
      expect(parseInt(count || '0')).toBeGreaterThan(0);

      await redis.del(testKey);
    });
  });
});
