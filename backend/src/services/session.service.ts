import { Redis } from 'ioredis';
import { getRedisClient } from '../config/redis.js';
import { NonceData, SessionData } from '../types/auth.types.js';
import { generateNonce, buildSignatureMessage } from '../utils/crypto.js';
import { getRefreshTokenTTLSeconds } from '../utils/jwt.js';

/**
 * Service for managing authentication sessions and nonces in Redis
 * Handles nonce creation/consumption for replay attack prevention
 * and session management for JWT refresh tokens
 */
export class SessionService {
  private redis: Redis;

  // Redis key prefixes for organization
  private readonly NONCE_PREFIX = 'auth:nonce:';
  private readonly SESSION_PREFIX = 'auth:session:';
  private readonly USER_SESSIONS_PREFIX = 'auth:user_sessions:';
  private readonly BLACKLIST_PREFIX = 'auth:blacklist:';

  // TTL values
  private readonly NONCE_TTL_SECONDS = 300; // 5 minutes

  constructor() {
    this.redis = getRedisClient();
  }

  // ===========================================================================
  // NONCE MANAGEMENT (Replay Attack Prevention)
  // ===========================================================================

  /**
   * Create a new authentication nonce for a public key
   *
   * REPLAY ATTACK PREVENTION:
   * - Each login attempt requires a fresh, server-generated nonce
   * - Nonces are stored in Redis with a short TTL (5 minutes)
   * - Nonces are deleted immediately after use (one-time use)
   * - Message includes timestamp to bind signature to specific time
   * - Each nonce is bound to a specific public key
   */
  async createNonce(publicKey: string): Promise<NonceData> {
    const nonce = generateNonce();
    const timestamp = Math.floor(Date.now() / 1000);
    const expiresAt = timestamp + this.NONCE_TTL_SECONDS;
    const message = buildSignatureMessage(
      nonce,
      timestamp,
      this.NONCE_TTL_SECONDS
    );

    const nonceData: NonceData = {
      nonce,
      publicKey,
      message,
      timestamp,
      expiresAt,
    };

    // Store nonce in Redis with TTL
    // Key format: auth:nonce:{publicKey}:{nonce}
    const key = `${this.NONCE_PREFIX}${publicKey}:${nonce}`;

    await this.redis.setex(
      key,
      this.NONCE_TTL_SECONDS,
      JSON.stringify(nonceData)
    );

    return nonceData;
  }

  /**
   * Consume a nonce (atomic get-and-delete to prevent replay attacks)
   *
   * This operation is ATOMIC using Redis pipeline to prevent race conditions
   * where the same nonce could be used twice in parallel requests.
   *
   * @returns NonceData if valid, null if nonce doesn't exist or already consumed
   */
  async consumeNonce(
    publicKey: string,
    nonce: string
  ): Promise<NonceData | null> {
    const key = `${this.NONCE_PREFIX}${publicKey}:${nonce}`;

    // Atomic operation: Get and Delete in one transaction
    // This prevents race conditions where same nonce is used twice
    const pipeline = this.redis.pipeline();
    pipeline.get(key);
    pipeline.del(key);

    const results = await pipeline.exec();

    if (!results) {
      return null;
    }

    const [getResult] = results;
    const data = getResult?.[1] as string | null;

    if (!data) {
      return null; // Nonce doesn't exist or already consumed
    }

    const nonceData = JSON.parse(data) as NonceData;

    // Extra validation: Verify nonce hasn't expired (beyond Redis TTL)
    const now = Math.floor(Date.now() / 1000);
    if (nonceData.expiresAt < now) {
      return null;
    }

    // Verify public key matches (prevents nonce reuse across accounts)
    if (nonceData.publicKey !== publicKey) {
      return null;
    }

    return nonceData;
  }

  // ===========================================================================
  // SESSION MANAGEMENT
  // ===========================================================================

  /**
   * Create a new session for a user
   * Sessions track active refresh tokens for revocation support
   */
  async createSession(sessionData: SessionData): Promise<void> {
    const sessionTTL = getRefreshTokenTTLSeconds();

    // Store session by token ID
    const sessionKey = `${this.SESSION_PREFIX}${sessionData.tokenId}`;
    await this.redis.setex(sessionKey, sessionTTL, JSON.stringify(sessionData));

    // Add to user's session set (for multi-session tracking)
    const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${sessionData.userId}`;
    await this.redis.sadd(userSessionsKey, sessionData.tokenId);
    await this.redis.expire(userSessionsKey, sessionTTL);
  }

  /**
   * Get session by token ID
   */
  async getSession(tokenId: string): Promise<SessionData | null> {
    const key = `${this.SESSION_PREFIX}${tokenId}`;
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    return JSON.parse(data) as SessionData;
  }

  /**
   * Delete a session (logout from single device)
   */
  async deleteSession(tokenId: string, userId: string): Promise<void> {
    const sessionKey = `${this.SESSION_PREFIX}${tokenId}`;
    const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;

    await this.redis.del(sessionKey);
    await this.redis.srem(userSessionsKey, tokenId);
  }

  /**
   * Delete all sessions for a user (logout from all devices)
   * @returns Number of sessions deleted
   */
  async deleteAllUserSessions(userId: string): Promise<number> {
    const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
    const tokenIds = await this.redis.smembers(userSessionsKey);

    if (tokenIds.length === 0) {
      return 0;
    }

    // Delete all session data
    const sessionKeys = tokenIds.map((id) => `${this.SESSION_PREFIX}${id}`);
    await this.redis.del(...sessionKeys, userSessionsKey);

    return tokenIds.length;
  }

  /**
   * Get all active sessions for a user
   * Automatically cleans up stale session references
   */
  async getUserSessions(userId: string): Promise<SessionData[]> {
    const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
    const tokenIds = await this.redis.smembers(userSessionsKey);

    if (tokenIds.length === 0) {
      return [];
    }

    const sessions: SessionData[] = [];

    for (const tokenId of tokenIds) {
      const session = await this.getSession(tokenId);
      if (session) {
        sessions.push(session);
      } else {
        // Clean up stale reference (session expired but still in set)
        await this.redis.srem(userSessionsKey, tokenId);
      }
    }

    return sessions;
  }

  /**
   * Count active sessions for a user
   */
  async getUserSessionCount(userId: string): Promise<number> {
    const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
    return await this.redis.scard(userSessionsKey);
  }

  // ===========================================================================
  // TOKEN BLACKLISTING
  // ===========================================================================

  /**
   * Blacklist a token (for logout before natural expiry)
   * Token is blacklisted for its remaining TTL
   */
  async blacklistToken(
    tokenId: string,
    expiresInSeconds: number
  ): Promise<void> {
    const key = `${this.BLACKLIST_PREFIX}${tokenId}`;
    await this.redis.setex(key, expiresInSeconds, '1');
  }

  /**
   * Check if a token is blacklisted
   */
  async isTokenBlacklisted(tokenId: string): Promise<boolean> {
    const key = `${this.BLACKLIST_PREFIX}${tokenId}`;
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  // ===========================================================================
  // SESSION ROTATION
  // ===========================================================================

  /**
   * Rotate a refresh token session (delete old, create new)
   * Used when refreshing tokens for enhanced security
   */
  async rotateSession(
    oldTokenId: string,
    newSessionData: SessionData
  ): Promise<void> {
    // Get old session to find user ID
    const oldSession = await this.getSession(oldTokenId);

    if (oldSession) {
      // Delete old session
      await this.deleteSession(oldTokenId, oldSession.userId);
    }

    // Create new session
    await this.createSession(newSessionData);
  }
}

// Singleton instance for convenience
export const sessionService = new SessionService();
