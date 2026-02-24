import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient } from '../config/redis.js';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { logger } from '../utils/logger.js';
import { ipKeyGenerator } from 'express-rate-limit';

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
  } catch {
    console.warn(
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
    return ipKeyGenerator(req, req.ip);
  } catch {
    return req.ip || 'unknown';
  }
}

/**
 * Rate limiter for authentication endpoints (strict)
 * Limits: 10 attempts per 15 minutes per IP
 */
export const authRateLimiter: RateLimiterMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('auth'),
  keyGenerator: (req: any) => getIpKey(req),
  message: rateLimitMessage(
    'Too many authentication attempts. Please try again in 15 minutes.'
  ),
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Rate limiter for challenge endpoint (moderate)
 * Limits: 5 requests per minute per public key or IP
 */
export const challengeRateLimiter: RateLimiterMiddleware = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('challenge'),
  keyGenerator: (req: any) => req.body?.publicKey || getIpKey(req),
  message: rateLimitMessage(
    'Too many challenge requests. Please wait a moment.'
  ),
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Rate limiter for general API endpoints (lenient)
 * Limits: 100 requests per minute per user or IP
 */
export const apiRateLimiter: RateLimiterMiddleware = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('api'),
  keyGenerator: (req: any) => {
    const authReq = req as AuthenticatedRequest;
    return authReq.user?.userId || getIpKey(req);
  },
  validate: { ip: false },
  message: rateLimitMessage('Too many requests. Please slow down.'),
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Rate limiter for refresh token endpoint
 * Limits: 10 refreshes per minute per IP
 */
export const refreshRateLimiter: RateLimiterMiddleware = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('refresh'),
  keyGenerator: (req: any) => getIpKey(req),
  message: rateLimitMessage('Too many refresh attempts.'),
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Rate limiter for sensitive operations (very strict)
 * Limits: 5 requests per hour per user
 */
export const sensitiveOperationRateLimiter: RateLimiterMiddleware = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('sensitive'),
  keyGenerator: (req: any) => {
    const authReq = req as AuthenticatedRequest;
    return authReq.user?.userId || getIpKey(req);
  },
  validate: { ip: false },
  message: rateLimitMessage(
    'Too many sensitive operations. Please try again later.'
  ),
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Create a custom rate limiter
 */
export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  prefix: string;
  message?: string;
}): RateLimiterMiddleware {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    store: createRedisStore(options.prefix),
    keyGenerator: (req: any) => {
      const authReq = req as AuthenticatedRequest;
      return authReq.user?.userId || getIpKey(req);
    },
    message: rateLimitMessage(options.message || 'Too many requests.'),
    skip: () => process.env.NODE_ENV === 'test',
  });
}
