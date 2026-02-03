import { UserRepository } from '../repositories/user.repository.js';
import { StellarService, stellarService } from './stellar.service.js';
import { SessionService, sessionService } from './session.service.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getAccessTokenTTLSeconds,
  getRefreshTokenTTLSeconds,
} from '../utils/jwt.js';
import { generateTokenId } from '../utils/crypto.js';
import {
  AuthError,
  ChallengeResponse,
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  SessionData,
} from '../types/auth.types.js';

/**
 * Authentication Service
 * Handles wallet-based authentication using Stellar signatures
 */
export class AuthService {
  private userRepository: UserRepository;
  private stellarSvc: StellarService;
  private sessionSvc: SessionService;

  constructor() {
    this.userRepository = new UserRepository();
    this.stellarSvc = stellarService;
    this.sessionSvc = sessionService;
  }

  /**
   * Generate authentication challenge (nonce) for wallet signing
   *
   * Step 1 of the authentication flow:
   * 1. Frontend requests a challenge with user's public key
   * 2. Backend generates a unique nonce and message
   * 3. Frontend displays the message in the wallet for signing
   */
  async generateChallenge(publicKey: string): Promise<ChallengeResponse> {
    // Validate public key format before creating nonce
    if (!this.stellarSvc.isValidPublicKey(publicKey)) {
      throw new AuthError(
        'INVALID_PUBLIC_KEY',
        'Invalid Stellar public key format',
        400
      );
    }

    // Create nonce (stored in Redis with 5-minute TTL)
    const nonceData = await this.sessionSvc.createNonce(publicKey);

    return {
      nonce: nonceData.nonce,
      message: nonceData.message,
      expiresAt: nonceData.expiresAt,
    };
  }

  /**
   * Authenticate user with wallet signature
   *
   * Step 2 of the authentication flow:
   * 1. Consume the nonce (atomic operation, prevents replay)
   * 2. Verify the signature using Stellar SDK
   * 3. Find or create user (auto-registration)
   * 4. Generate JWT tokens (access + refresh)
   * 5. Store session in Redis
   */
  async login(
    params: LoginRequest,
    metadata?: { userAgent?: string; ipAddress?: string }
  ): Promise<LoginResponse> {
    const { publicKey, signature, nonce } = params;

    // STEP 1: Validate public key format
    if (!this.stellarSvc.isValidPublicKey(publicKey)) {
      throw new AuthError(
        'INVALID_PUBLIC_KEY',
        'Invalid Stellar public key format',
        400
      );
    }

    // STEP 2: Consume nonce (atomic - prevents replay attacks)
    const nonceData = await this.sessionSvc.consumeNonce(publicKey, nonce);
    if (!nonceData) {
      throw new AuthError(
        'INVALID_NONCE',
        'Nonce expired, already used, or invalid',
        401
      );
    }

    // STEP 3: Verify signature against the challenge message
    const isValid = this.stellarSvc.verifySignature(
      publicKey,
      nonceData.message,
      signature
    );

    if (!isValid) {
      throw new AuthError(
        'INVALID_SIGNATURE',
        'Wallet signature verification failed',
        401
      );
    }

    // STEP 4: Find or create user (auto-create on first wallet login)
    let user = await this.userRepository.findByWalletAddress(publicKey);

    if (!user) {
      // Auto-create user on first wallet login
      const shortKey = this.stellarSvc
        .shortenPublicKey(publicKey)
        .replace(/\./g, '');
      const timestamp = Date.now().toString(36);

      user = await this.userRepository.createUser({
        // Generate unique email for wallet users (required by schema)
        email: `${publicKey.toLowerCase().slice(0, 16)}.${timestamp}@wallet.boxmeout.io`,
        username: `stellar_${shortKey}_${timestamp}`,
        passwordHash: '', // No password for wallet auth
        walletAddress: publicKey,
      });
    }

    // STEP 5: Generate tokens
    const tokenId = generateTokenId();

    const accessToken = signAccessToken({
      userId: user.id,
      publicKey: user.walletAddress!,
      tier: user.tier,
    });

    const refreshToken = signRefreshToken({
      userId: user.id,
      tokenId,
    });

    // STEP 6: Store session in Redis
    const sessionData: SessionData = {
      userId: user.id,
      tokenId,
      publicKey: user.walletAddress!,
      createdAt: Date.now(),
      expiresAt: Date.now() + getRefreshTokenTTLSeconds() * 1000,
      userAgent: metadata?.userAgent,
      ipAddress: metadata?.ipAddress,
    };

    await this.sessionSvc.createSession(sessionData);

    // STEP 7: Update last login timestamp
    await this.userRepository.updateLastLogin(user.id);

    // STEP 8: Return response
    return {
      accessToken,
      refreshToken,
      expiresIn: getAccessTokenTTLSeconds(),
      tokenType: 'Bearer',
      user: {
        id: user.id,
        publicKey: user.walletAddress!,
        username: user.username,
        tier: user.tier,
      },
    };
  }

  /**
   * Refresh access token using refresh token
   * Implements token rotation for enhanced security
   *
   * Token Rotation:
   * - Old refresh token is invalidated after use
   * - New refresh token is issued with each refresh
   * - Prevents refresh token reuse attacks
   */
  async refresh(
    refreshToken: string,
    metadata?: { userAgent?: string; ipAddress?: string }
  ): Promise<RefreshResponse> {
    // STEP 1: Verify refresh token signature and expiry
    const payload = verifyRefreshToken(refreshToken);

    // STEP 2: Check if session exists
    const session = await this.sessionSvc.getSession(payload.tokenId);
    if (!session) {
      throw new AuthError(
        'SESSION_NOT_FOUND',
        'Session expired or invalidated',
        401
      );
    }

    // STEP 3: Check if token is blacklisted (manual logout)
    const isBlacklisted = await this.sessionSvc.isTokenBlacklisted(
      payload.tokenId
    );
    if (isBlacklisted) {
      throw new AuthError('TOKEN_REVOKED', 'Token has been revoked', 401);
    }

    // STEP 4: Get fresh user data (tier might have changed)
    const user = await this.userRepository.findById(payload.userId);
    if (!user) {
      throw new AuthError('USER_NOT_FOUND', 'User no longer exists', 401);
    }

    if (!user.isActive) {
      throw new AuthError('USER_INACTIVE', 'User account is inactive', 401);
    }

    // STEP 5: Generate new token pair (rotation)
    const newTokenId = generateTokenId();

    const newAccessToken = signAccessToken({
      userId: user.id,
      publicKey: user.walletAddress!,
      tier: user.tier,
    });

    const newRefreshToken = signRefreshToken({
      userId: user.id,
      tokenId: newTokenId,
    });

    // STEP 6: Rotate session (delete old, create new)
    const newSessionData: SessionData = {
      userId: user.id,
      tokenId: newTokenId,
      publicKey: user.walletAddress!,
      createdAt: Date.now(),
      expiresAt: Date.now() + getRefreshTokenTTLSeconds() * 1000,
      userAgent: metadata?.userAgent,
      ipAddress: metadata?.ipAddress,
    };

    await this.sessionSvc.rotateSession(payload.tokenId, newSessionData);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: getAccessTokenTTLSeconds(),
    };
  }

  /**
   * Logout - invalidate current session
   */
  async logout(tokenId: string, userId: string): Promise<void> {
    await this.sessionSvc.deleteSession(tokenId, userId);

    // Blacklist the token for its remaining TTL (prevents reuse)
    await this.sessionSvc.blacklistToken(tokenId, getRefreshTokenTTLSeconds());
  }

  /**
   * Logout from all devices
   * @returns Number of sessions invalidated
   */
  async logoutAll(userId: string): Promise<number> {
    return this.sessionSvc.deleteAllUserSessions(userId);
  }

  /**
   * Get all active sessions for a user
   */
  async getActiveSessions(userId: string): Promise<SessionData[]> {
    return this.sessionSvc.getUserSessions(userId);
  }
}

// Singleton instance for convenience
export const authService = new AuthService();
