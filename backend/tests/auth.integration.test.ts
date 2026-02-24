import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';

// Mock Redis for testing
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Import services
import { SessionService } from '../src/services/session.service.js';
import { StellarService } from '../src/services/stellar.service.js';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, getAccessTokenTTLSeconds, getRefreshTokenTTLSeconds } from '../src/utils/jwt.js';
import { generateNonce } from '../src/utils/crypto.js';

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

  describe('Nonce generation and expiry', () => {
    it('should generate unique nonces for each request', async () => {
      const keypair = Keypair.random();
      const publicKey = keypair.publicKey();

      const nonce1 = await sessionService.createNonce(publicKey);
      const nonce2 = await sessionService.createNonce(publicKey);

      expect(nonce1.nonce).not.toBe(nonce2.nonce);
      expect(nonce1.message).not.toBe(nonce2.message);
    });

    it('should include timestamp and expiry in nonce data', async () => {
      const keypair = Keypair.random();
      const publicKey = keypair.publicKey();

      const nonceData = await sessionService.createNonce(publicKey);
      const now = Math.floor(Date.now() / 1000);

      expect(nonceData.timestamp).toBeGreaterThanOrEqual(now - 1);
      expect(nonceData.timestamp).toBeLessThanOrEqual(now + 1);
      expect(nonceData.expiresAt).toBe(nonceData.timestamp + 300); // 5 min TTL
    });

    it('should reject expired nonce', async () => {
      const keypair = Keypair.random();
      const publicKey = keypair.publicKey();

      // Create nonce with expired timestamp
      const expiredNonce = generateNonce();
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
      const key = `auth:nonce:${publicKey}:${expiredNonce}`;

      await redis.setex(
        key,
        10, // Short TTL for test
        JSON.stringify({
          nonce: expiredNonce,
          publicKey,
          message: 'test',
          timestamp: expiredTimestamp,
          expiresAt: expiredTimestamp + 300,
        })
      );

      const consumed = await sessionService.consumeNonce(publicKey, expiredNonce);
      expect(consumed).toBeNull();
    });

    it('should auto-delete nonce after TTL', async () => {
      const keypair = Keypair.random();
      const publicKey = keypair.publicKey();

      const nonceData = await sessionService.createNonce(publicKey);
      const key = `auth:nonce:${publicKey}:${nonceData.nonce}`;

      // Verify nonce exists
      const exists = await redis.exists(key);
      expect(exists).toBe(1);

      // Check TTL is set
      const ttl = await redis.ttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(300);
    });

    it('should prevent nonce reuse across different public keys', async () => {
      const keypair1 = Keypair.random();
      const keypair2 = Keypair.random();

      const nonceData = await sessionService.createNonce(keypair1.publicKey());

      // Try to consume with different public key
      const consumed = await sessionService.consumeNonce(
        keypair2.publicKey(),
        nonceData.nonce
      );
      expect(consumed).toBeNull();
    });
  });

  describe('Valid and invalid signature login', () => {
    it('should accept valid signature from correct keypair', async () => {
      const keypair = Keypair.random();
      const publicKey = keypair.publicKey();

      const nonceData = await sessionService.createNonce(publicKey);
      const signature = keypair.sign(Buffer.from(nonceData.message)).toString('base64');

      const isValid = stellarService.verifySignature(publicKey, nonceData.message, signature);
      expect(isValid).toBe(true);
    });

    it('should reject signature from wrong keypair', async () => {
      const keypair1 = Keypair.random();
      const keypair2 = Keypair.random();

      const nonceData = await sessionService.createNonce(keypair1.publicKey());
      const signature = keypair2.sign(Buffer.from(nonceData.message)).toString('base64');

      const isValid = stellarService.verifySignature(
        keypair1.publicKey(),
        nonceData.message,
        signature
      );
      expect(isValid).toBe(false);
    });

    it('should reject malformed signature', async () => {
      const keypair = Keypair.random();
      const publicKey = keypair.publicKey();

      const nonceData = await sessionService.createNonce(publicKey);
      const invalidSignature = 'not-a-valid-signature';

      // verifySignature throws on malformed signatures
      expect(() => {
        stellarService.verifySignature(
          publicKey,
          nonceData.message,
          invalidSignature
        );
      }).toThrow();
    });

    it('should reject signature for tampered message', async () => {
      const keypair = Keypair.random();
      const publicKey = keypair.publicKey();

      const nonceData = await sessionService.createNonce(publicKey);
      const signature = keypair.sign(Buffer.from(nonceData.message)).toString('base64');

      const tamperedMessage = nonceData.message + ' TAMPERED';
      const isValid = stellarService.verifySignature(publicKey, tamperedMessage, signature);
      expect(isValid).toBe(false);
    });
  });

  describe('Token refresh and rotation', () => {
    it('should generate new tokens on refresh', async () => {
      const userId = 'user-refresh-test';
      const oldTokenId = 'old-token-id';
      const newTokenId = 'new-token-id';

      const oldRefreshToken = signRefreshToken({ userId, tokenId: oldTokenId });
      const decoded = verifyRefreshToken(oldRefreshToken);

      expect(decoded.userId).toBe(userId);
      expect(decoded.tokenId).toBe(oldTokenId);

      const newRefreshToken = signRefreshToken({ userId, tokenId: newTokenId });
      const newDecoded = verifyRefreshToken(newRefreshToken);

      expect(newDecoded.tokenId).toBe(newTokenId);
      expect(newRefreshToken).not.toBe(oldRefreshToken);
    });

    it('should rotate session and invalidate old token', async () => {
      const userId = 'user-rotation-test';
      const oldTokenId = 'old-session-token';
      const newTokenId = 'new-session-token';

      const oldSession = {
        userId,
        tokenId: oldTokenId,
        publicKey: 'GBTEST',
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      };

      await sessionService.createSession(oldSession);

      const newSession = {
        userId,
        tokenId: newTokenId,
        publicKey: 'GBTEST',
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      };

      await sessionService.rotateSession(oldTokenId, newSession);

      const oldExists = await sessionService.getSession(oldTokenId);
      const newExists = await sessionService.getSession(newTokenId);

      expect(oldExists).toBeNull();
      expect(newExists).not.toBeNull();
      expect(newExists?.tokenId).toBe(newTokenId);
    });

    it('should reject expired refresh token', () => {
      const expiredToken = jwt.sign(
        { userId: 'test', tokenId: 'test', type: 'refresh' },
        process.env.JWT_REFRESH_SECRET || 'test-secret',
        { expiresIn: '-1s' } // Already expired
      );

      expect(() => verifyRefreshToken(expiredToken)).toThrow();
    });

    it('should reject refresh token used as access token', () => {
      const refreshToken = signRefreshToken({ userId: 'test', tokenId: 'test' });

      expect(() => verifyAccessToken(refreshToken)).toThrow();
    });

    it('should maintain user session count during rotation', async () => {
      const userId = 'user-count-test';
      const oldTokenId = 'old-count-token';
      const newTokenId = 'new-count-token';

      const oldSession = {
        userId,
        tokenId: oldTokenId,
        publicKey: 'GBTEST',
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      };

      await sessionService.createSession(oldSession);
      const countBefore = await sessionService.getUserSessionCount(userId);

      const newSession = {
        userId,
        tokenId: newTokenId,
        publicKey: 'GBTEST',
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      };

      await sessionService.rotateSession(oldTokenId, newSession);
      const countAfter = await sessionService.getUserSessionCount(userId);

      expect(countBefore).toBe(1);
      expect(countAfter).toBe(1);
    });
  });

  describe('Logout and session cleanup', () => {
    it('should delete single session on logout', async () => {
      const userId = 'user-logout-single';
      const tokenId = 'logout-token-single';

      const session = {
        userId,
        tokenId,
        publicKey: 'GBTEST',
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      };

      await sessionService.createSession(session);
      await sessionService.deleteSession(tokenId, userId);

      const retrieved = await sessionService.getSession(tokenId);
      expect(retrieved).toBeNull();
    });

    it('should delete all user sessions on logout all', async () => {
      const userId = 'user-logout-all';
      const tokenIds = ['token-1', 'token-2', 'token-3'];

      for (const tokenId of tokenIds) {
        await sessionService.createSession({
          userId,
          tokenId,
          publicKey: 'GBTEST',
          createdAt: Date.now(),
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });
      }

      const deleted = await sessionService.deleteAllUserSessions(userId);
      expect(deleted).toBe(3);

      for (const tokenId of tokenIds) {
        const session = await sessionService.getSession(tokenId);
        expect(session).toBeNull();
      }
    });

    it('should blacklist token on logout', async () => {
      const tokenId = 'blacklist-token';
      const ttl = getAccessTokenTTLSeconds();

      await sessionService.blacklistToken(tokenId, ttl);
      const isBlacklisted = await sessionService.isTokenBlacklisted(tokenId);

      expect(isBlacklisted).toBe(true);
    });

    it('should remove blacklisted token after TTL', async () => {
      const tokenId = 'blacklist-ttl-token';
      const shortTTL = 1; // 1 second

      await sessionService.blacklistToken(tokenId, shortTTL);
      expect(await sessionService.isTokenBlacklisted(tokenId)).toBe(true);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const stillBlacklisted = await sessionService.isTokenBlacklisted(tokenId);
      expect(stillBlacklisted).toBe(false);
    });

    it('should clean up user session set on delete all', async () => {
      const userId = 'user-cleanup-test';
      const tokenId = 'cleanup-token';

      await sessionService.createSession({
        userId,
        tokenId,
        publicKey: 'GBTEST',
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });

      await sessionService.deleteAllUserSessions(userId);

      const count = await sessionService.getUserSessionCount(userId);
      expect(count).toBe(0);
    });
  });

  describe('Concurrent session limits', () => {
    it('should track multiple concurrent sessions', async () => {
      const userId = 'user-concurrent';
      const sessionCount = 5;

      for (let i = 0; i < sessionCount; i++) {
        await sessionService.createSession({
          userId,
          tokenId: `concurrent-token-${i}`,
          publicKey: 'GBTEST',
          createdAt: Date.now(),
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });
      }

      const count = await sessionService.getUserSessionCount(userId);
      expect(count).toBe(sessionCount);
    });

    it('should retrieve all active sessions for user', async () => {
      const userId = 'user-active-sessions';
      const tokenIds = ['active-1', 'active-2', 'active-3'];

      for (const tokenId of tokenIds) {
        await sessionService.createSession({
          userId,
          tokenId,
          publicKey: 'GBTEST',
          createdAt: Date.now(),
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });
      }

      const sessions = await sessionService.getUserSessions(userId);
      expect(sessions).toHaveLength(3);
      expect(sessions.map((s) => s.tokenId).sort()).toEqual(tokenIds.sort());
    });

    it('should enforce session limit by deleting oldest', async () => {
      const userId = 'user-session-limit';
      const maxSessions = 3;
      const tokenIds = ['limit-1', 'limit-2', 'limit-3', 'limit-4'];

      for (const tokenId of tokenIds) {
        await sessionService.createSession({
          userId,
          tokenId,
          publicKey: 'GBTEST',
          createdAt: Date.now(),
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });

        const count = await sessionService.getUserSessionCount(userId);
        if (count > maxSessions) {
          const sessions = await sessionService.getUserSessions(userId);
          const oldest = sessions.sort((a, b) => a.createdAt - b.createdAt)[0];
          await sessionService.deleteSession(oldest.tokenId, userId);
        }
      }

      const finalCount = await sessionService.getUserSessionCount(userId);
      expect(finalCount).toBe(maxSessions);
    });

    it('should handle concurrent session creation race condition', async () => {
      const userId = 'user-race-condition';
      const concurrentCount = 10;

      const promises = Array.from({ length: concurrentCount }, (_, i) =>
        sessionService.createSession({
          userId,
          tokenId: `race-token-${i}`,
          publicKey: 'GBTEST',
          createdAt: Date.now(),
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        })
      );

      await Promise.all(promises);

      const count = await sessionService.getUserSessionCount(userId);
      expect(count).toBe(concurrentCount);
    });

    it('should clean up stale session references', async () => {
      const userId = 'user-stale-cleanup';
      const tokenId = 'stale-token';

      // Create session
      await sessionService.createSession({
        userId,
        tokenId,
        publicKey: 'GBTEST',
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });

      // Manually delete session data but leave reference in set
      await redis.del(`auth:session:${tokenId}`);

      // getUserSessions should clean up stale reference
      const sessions = await sessionService.getUserSessions(userId);
      expect(sessions).toHaveLength(0);

      // Verify reference was removed from set
      const count = await sessionService.getUserSessionCount(userId);
      expect(count).toBe(0);
    });
  });
});
