import { Request } from 'express';
import { UserTier } from '@prisma/client';

// ============================================================================
// JWT PAYLOADS
// ============================================================================

export interface AccessTokenPayload {
  userId: string;
  publicKey: string;
  tier: UserTier;
  type: 'access';
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
  type: 'refresh';
  iat?: number;
  exp?: number;
}

// ============================================================================
// NONCE MANAGEMENT
// ============================================================================

export interface NonceData {
  nonce: string;
  publicKey: string;
  message: string;
  timestamp: number;
  expiresAt: number;
}

// ============================================================================
// SESSION DATA
// ============================================================================

export interface SessionData {
  userId: string;
  tokenId: string;
  publicKey: string;
  createdAt: number;
  expiresAt: number;
  userAgent?: string;
  ipAddress?: string;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface ChallengeRequest {
  publicKey: string;
}

export interface ChallengeResponse {
  nonce: string;
  message: string;
  expiresAt: number;
}

export interface LoginRequest {
  publicKey: string;
  signature: string;
  nonce: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  user: {
    id: string;
    publicKey: string;
    username: string;
    tier: UserTier;
  };
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ============================================================================
// EXTENDED EXPRESS REQUEST
// ============================================================================

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    publicKey: string;
    tier: UserTier;
  };
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
