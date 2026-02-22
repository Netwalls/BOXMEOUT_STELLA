import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient } from '../config/redis.js';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { logger } from '../utils/logger.js';
import { ipKeyGenerator } from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RateLimiterMiddleware = any;

/**
 * Create a Redis-backed rate limiter store
 * Falls back to memory store if Redis is unavailable
 */
function createRedisStore(prefix: string) {
  try {
    return new RedisStore({
      // Use sendCommand for ioredis compatibility
      sendCommand: (async (...args: string[]) => {
        const client = getRedisClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (client as any).call(...args);
      }) as any,
      prefix: `rl:${prefix}:`,
    });
  } catch (error) {
    logger.warn(
      `Failed to create Redis store for rate limiter (${prefix}), using memory store`
    );
    return undefined; // Falls back to memory store
  }
}

/**
 * Standard rate limit error response format
 */
const rateLimitMessage = (message: string) => ({
  success: false,
  error: {
    code: 'RATE_LIMITED',
    message,
  },
});

/**
 * Helper function to safely get IP address with IPv6 support
 */
function getIpKey(req: any): string {
  try {
    // Use the ipKeyGenerator helper function for proper IPv6 support
    return ipKeyGenerator(req, req.ip);
  } catch (error) {
    // Fallback if ipKeyGenerator fails
    return req.ip || 'unknown';
  }
}

/**
 * Get wallet address from authenticated request
 * Falls back to IP if wallet not available
 */
function getWalletKey(req: any): string {
  const authReq = req as AuthenticatedRequest;
  // Use publicKey (wallet address) if available, otherwise fall back to IP
  return authReq.user?.publicKey || getIpKey(req);
}

/**
 * Custom handler to add Retry-After header
 */
function createRateLimitHandler(message: string) {
  return (req: Request, res: Response) => {
    const retryAfter = res.getHeader('Retry-After');
    res.status(429).json({
      ...rateLimitMessage(message),
      retryAfter: retryAfter ? parseInt(retryAfter as string, 10) : undefined,
    });
  };
}

/**
 * Rate limiter for authentication endpoints (strict)
 * Prevents brute force attacks on login
 *
 * Limits: 5 attempts per minute per wallet/IP
 */
export const authRateLimiter: RateLimiterMiddleware = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  store: createRedisStore('auth'),
  keyGenerator: (req: any) => {
    // For auth endpoints, use publicKey from body if available
    return req.body?.publicKey || getIpKey(req);
  },
  handler: createRateLimitHandler(
    'Too many authentication attempts. Please try again later.'
  ),
  skip: () => process.env.NODE_ENV === 'test', // Skip in tests
});

/**
 * Rate limiter for challenge endpoint (moderate)
 * Prevents nonce generation spam
 *
 * Limits: 5 requests per minute per public key or IP
 */
export const challengeRateLimiter: RateLimiterMiddleware = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('challenge'),
  keyGenerator: (req: any) => {
    // For challenge endpoint, use publicKey if available, otherwise IP
    return req.body?.publicKey || getIpKey(req);
  },
  handler: createRateLimitHandler(
    'Too many challenge requests. Please wait a moment.'
  ),
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Rate limiter for prediction endpoints
 * Limits: 10 requests per minute per wallet address
 */
export const predictionRateLimiter: RateLimiterMiddleware = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('predictions'),
  keyGenerator: getWalletKey,
  handler: createRateLimitHandler(
    'Too many prediction requests. Please slow down.'
  ),
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Rate limiter for trade endpoints (buy/sell shares)
 * Limits: 30 requests per minute per wallet address
 */
export const tradeRateLimiter: RateLimiterMiddleware = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('trades'),
  keyGenerator: getWalletKey,
  handler: createRateLimitHandler(
    'Too many trade requests. Please slow down.'
  ),
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Rate limiter for general API endpoints (lenient)
 * Protects against API abuse while allowing normal usage
 *
 * Limits: 100 requests per minute per wallet or IP
 */
export const apiRateLimiter: RateLimiterMiddleware = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('api'),
  keyGenerator: getWalletKey,
  handler: createRateLimitHandler('Too many requests. Please slow down.'),
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Rate limiter for refresh token endpoint
 * Prevents token refresh spam
 *
 * Limits: 10 refreshes per minute per IP
 */
export const refreshRateLimiter: RateLimiterMiddleware = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('refresh'),
  keyGenerator: (req: any) => getIpKey(req),
  handler: createRateLimitHandler('Too many refresh attempts.'),
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Rate limiter for sensitive operations (very strict)
 * Use for actions like changing email, connecting new wallet, etc.
 *
 * Limits: 5 requests per hour per wallet
 */
export const sensitiveOperationRateLimiter: RateLimiterMiddleware = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('sensitive'),
  keyGenerator: getWalletKey,
  handler: createRateLimitHandler(
    'Too many sensitive operations. Please try again later.'
  ),
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Create a custom rate limiter with specified options
 * Useful for endpoints with special requirements
 */
export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  prefix: string;
  message?: string;
  useWallet?: boolean;
}): RateLimiterMiddleware {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    store: createRedisStore(options.prefix),
    keyGenerator: options.useWallet !== false ? getWalletKey : getIpKey,
    handler: createRateLimitHandler(
      options.message || 'Rate limit exceeded.'
    ),
    skip: () => process.env.NODE_ENV === 'test',
  });
}
