import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient } from '../config/redis.js';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { logger } from '../utils/logger.js';
import { ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response } from 'express';

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
 * Handler that injects Retry-After header in seconds and standard response.
 */
function buildHandler(message: string) {
  return (_req: Request, res: Response) => {
    const retryAfter = res.getHeader('RateLimit-Reset');
    if (retryAfter) {
      const secondsUntilReset = Math.ceil(
        Number(retryAfter) - Date.now() / 1000
      );
      res.set('Retry-After', String(Math.max(0, secondsUntilReset)));
    }
    res.status(429).json(rateLimitMessage(message));
  };
}

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
 * Derive the best key to identify a requester:
 * Priority: walletAddress > userId > IP
 * walletAddress is on req.user.publicKey (Stellar key used as wallet).
 */
function getWalletOrUserKey(req: any): string {
  const authReq = req as AuthenticatedRequest;
  // publicKey IS the Stellar wallet address — safest unique identifier
  if (authReq.user?.publicKey) {
    return `wallet:${authReq.user.publicKey}`;
  }
  if (authReq.user?.userId) {
    return `user:${authReq.user.userId}`;
  }
  return `ip:${getIpKey(req)}`;
}

/**
 * Rate limiter for authentication endpoints (strict)
 * AC: auth — 5 attempts per minute per wallet/IP
 */
export const authRateLimiter: RateLimiterMiddleware = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: 'draft-7', // includes RateLimit-Reset as Unix timestamp
  legacyHeaders: false,
  store: createRedisStore('auth'),
  // Auth endpoints — identify by publicKey in body (pre-auth) or wallet
  keyGenerator: (req: any) => {
    const pubKey = req.body?.publicKey as string | undefined;
    return pubKey ? `wallet:${pubKey}` : `ip:${getIpKey(req)}`;
  },
  handler: buildHandler(
    'Too many authentication attempts. Please try again in 1 minute.'
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
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: createRedisStore('challenge'),
  keyGenerator: (req: any) => {
    const pubKey = req.body?.publicKey as string | undefined;
    return pubKey ? `wallet:${pubKey}` : `ip:${getIpKey(req)}`;
  },
  handler: buildHandler('Too many challenge requests. Please wait a moment.'),
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Rate limiter for prediction endpoints
 * AC: predictions — 10 per minute per wallet address
 */
export const predictionRateLimiter: RateLimiterMiddleware = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: createRedisStore('predictions'),
  keyGenerator: (req: any) => getWalletOrUserKey(req),
  validate: { ip: false },
  handler: buildHandler(
    'Too many prediction requests. Limit is 10 per minute per wallet.'
  ),
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Rate limiter for trading/trade endpoints
 * AC: trades — 30 per minute per wallet address
 */
export const tradeRateLimiter: RateLimiterMiddleware = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: createRedisStore('trades'),
  keyGenerator: (req: any) => getWalletOrUserKey(req),
  validate: { ip: false },
  handler: buildHandler(
    'Too many trade requests. Limit is 30 per minute per wallet.'
  ),
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Rate limiter for general API endpoints (lenient)
 * Limits: 100 requests per minute per wallet or IP
 */
export const apiRateLimiter: RateLimiterMiddleware = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: createRedisStore('api'),
  keyGenerator: (req: any) => getWalletOrUserKey(req),
  validate: { ip: false },
  handler: buildHandler('Too many requests. Please slow down.'),
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Rate limiter for refresh token endpoint
 * Limits: 10 refreshes per minute per IP
 */
export const refreshRateLimiter: RateLimiterMiddleware = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: createRedisStore('refresh'),
  keyGenerator: (req: any) => getIpKey(req),
  handler: buildHandler('Too many refresh attempts.'),
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Rate limiter for sensitive operations (very strict)
 * Limits: 5 requests per hour per wallet
 */
export const sensitiveOperationRateLimiter: RateLimiterMiddleware = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: createRedisStore('sensitive'),
  keyGenerator: (req: any) => getWalletOrUserKey(req),
  validate: { ip: false },
  handler: buildHandler(
    'Too many sensitive operations. Please try again later.'
  ),
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Rate limiter for USDC withdrawals
 * Limits: 3 withdrawals per 24 hours per wallet
 */
export const withdrawalRateLimiter: RateLimiterMiddleware = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: createRedisStore('withdrawal'),
  keyGenerator: (req: any) => `withdrawal:${getWalletOrUserKey(req)}`,
  validate: { ip: false },
  handler: buildHandler(
    'Withdrawal limit reached. Maximum 3 withdrawals per 24 hours.'
  ),
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Create a custom rate limiter (uses wallet key by default)
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
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: createRedisStore(options.prefix),
    keyGenerator: (req: any) => getWalletOrUserKey(req),
    handler: buildHandler(options.message || 'Too many requests.'),
    skip: () => process.env.NODE_ENV === 'test',
  });
}
