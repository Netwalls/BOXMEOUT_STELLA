import jwt, { SignOptions, JwtPayload, Secret } from 'jsonwebtoken';
import ms, { StringValue } from 'ms';
import { AccessTokenPayload, RefreshTokenPayload, AuthError } from '../types/auth.types.js';

// Validate JWT secrets are configured
function getJwtSecret(envVar: string, name: string): Secret {
  const secret = process.env[envVar];
  
  if (!secret) {
    throw new Error(
      `${name} is not configured. Set ${envVar} environment variable. ` +
      'Minimum 32 characters recommended for production.'
    );
  }
  
  if (process.env.NODE_ENV === 'production' && secret.length < 32) {
    throw new Error(
      `${name} is too short. Use at least 32 characters in production.`
    );
  }
  
  return secret;
}

// Environment configuration with defaults for development
const ACCESS_SECRET: Secret =  getJwtSecret('JWT_ACCESS_SECRET', 'JWT_ACCESS_SECRET');
const REFRESH_SECRET: Secret = getJwtSecret('JWT_REFRESH_SECRET', 'JWT_REFRESH_SECRET');
const ACCESS_TTL: StringValue = (process.env.JWT_ACCESS_TTL || '15m') as StringValue;
const REFRESH_TTL: StringValue = (process.env.JWT_REFRESH_TTL || '7d') as StringValue;

// Warn if using default secrets in non-development environment
if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
  if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
    console.warn('⚠️  WARNING: Using default JWT secrets in production. Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET!');
  }
}

/**
 * Sign an access token (short-lived, contains user info)
 */
export function signAccessToken(
  payload: Omit<AccessTokenPayload, 'type' | 'iat' | 'exp'>
): string {
  const tokenPayload: AccessTokenPayload = {
    ...payload,
    type: 'access',
  };

  const options: SignOptions = {
    expiresIn: ACCESS_TTL as unknown as number,
    algorithm: 'HS256',
  };

  return jwt.sign(tokenPayload as object, ACCESS_SECRET, options);
}

/**
 * Sign a refresh token (long-lived, minimal info for rotation)
 */
export function signRefreshToken(
  payload: Omit<RefreshTokenPayload, 'type' | 'iat' | 'exp'>
): string {
  const tokenPayload: RefreshTokenPayload = {
    ...payload,
    type: 'refresh',
  };

  const options: SignOptions = {
    expiresIn: REFRESH_TTL as unknown as number,
    algorithm: 'HS256',
  };

  return jwt.sign(tokenPayload as object, REFRESH_SECRET, options);
}

/**
 * Verify and decode an access token
 * @throws AuthError if token is invalid or expired
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, ACCESS_SECRET) as AccessTokenPayload;

    if (decoded.type !== 'access') {
      throw new AuthError('INVALID_TOKEN_TYPE', 'Expected access token', 401);
    }

    return decoded;
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthError('TOKEN_EXPIRED', 'Access token has expired', 401);
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthError('INVALID_TOKEN', 'Invalid access token', 401);
    }
    throw error;
  }
}

/**
 * Verify and decode a refresh token
 * @throws AuthError if token is invalid or expired
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, REFRESH_SECRET) as RefreshTokenPayload;

    if (decoded.type !== 'refresh') {
      throw new AuthError('INVALID_TOKEN_TYPE', 'Expected refresh token', 401);
    }

    return decoded;
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthError('TOKEN_EXPIRED', 'Refresh token has expired', 401);
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthError('INVALID_TOKEN', 'Invalid refresh token', 401);
    }
    throw error;
  }
}

/**
 * Decode token without verification (for debugging/logging)
 * WARNING: Do not use this for authentication - it doesn't verify the signature
 */
export function decodeToken(token: string): JwtPayload | null {
  return jwt.decode(token) as JwtPayload | null;
}

/**
 * Get access token TTL in seconds
 */
export function getAccessTokenTTLSeconds(): number {
  return Math.floor(ms(ACCESS_TTL) / 1000);
}

/**
 * Get refresh token TTL in seconds
 */
export function getRefreshTokenTTLSeconds(): number {
  return Math.floor(ms(REFRESH_TTL) / 1000);
}

/**
 * Get access token TTL in milliseconds
 */
export function getAccessTokenTTLMs(): number {
  return ms(ACCESS_TTL);
}

/**
 * Get refresh token TTL in milliseconds
 */
export function getRefreshTokenTTLMs(): number {
  return ms(REFRESH_TTL);
}
