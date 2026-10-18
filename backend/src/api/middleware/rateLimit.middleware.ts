import { randomBytes } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { redis } from "../../lib/redis";

/**
 * #1397 B-99: the single rate-limit implementation for the API. Every limiter
 * is a Redis-backed sliding window, so limits hold across processes.
 *
 * Documented defaults (all windows are 60 seconds unless noted):
 *
 * | Route                                  | Limit                         | Key                |
 * |----------------------------------------|-------------------------------|--------------------|
 * | GET  /api/bets/payout-estimate         | 30 per window                 | wallet, else IP    |
 * | GET  /api/markets/search               | 60 per window                 | wallet, else IP    |
 * | GET  /api/auth/challenge               | 20 per window                 | IP                 |
 * | GET  /api/auth/challenge               | 5 per window                  | `address` query    |
 * | POST /api/markets                      | 10 per window                 | IP                 |
 * | POST /api/markets                      | 5 per window                  | wallet             |
 * | GET  /api/markets/:id/stream (SSE)     | 5 open connections at a time  | IP                 |
 * | /api/admin/* (write routes)            | see admin.routes.ts           | wallet, else IP    |
 */
export const RATE_LIMITS = {
  payoutEstimate: { windowMs: 60_000, max: 30 },
  marketSearch: { windowMs: 60_000, max: 60 },
  challengeByIp: { windowMs: 60_000, max: 20 },
  challengeByAddress: { windowMs: 60_000, max: 5 },
  createMarketByIp: { windowMs: 60_000, max: 10 },
  createMarketByWallet: { windowMs: 60_000, max: 5 },
  sseConcurrentPerIp: { max: 5, ttlSeconds: 3600 },
} as const;

export interface RateLimitOptions {
  /** Sliding window size in milliseconds. */
  windowMs: number;
  /** Max requests allowed per identifier within the window. */
  max: number;
  /** Namespaces the Redis keys so different route groups don't share limits. */
  keyPrefix: string;
  /** Derives the rate-limit identifier from the request. Defaults to wallet address (if authenticated) or IP. */
  keyGenerator?: (req: Request) => string;
}

type RequestWithContext = Request & { id?: string; walletAddress?: string };

/** Identifier for unauthenticated routes: the client IP. */
export function keyByIp(req: Request): string {
  return req.ip ?? "unknown";
}

/** Identifier for routes that take a Stellar address in the query string. */
export function keyByAddressQuery(req: Request): string {
  const address = String(req.query.address ?? "").trim();
  return address.length > 0 ? address : keyByIp(req);
}

function defaultKeyGenerator(req: Request): string {
  const walletAddress = (req as RequestWithContext).walletAddress;
  return walletAddress ?? keyByIp(req);
}

/**
 * Sends the standard 429 envelope used by errorHandlerMiddleware
 * ({ error, code, requestId }), plus Retry-After in seconds.
 */
function sendRateLimited(req: Request, res: Response, retryAfterSeconds: number): void {
  res.setHeader("Retry-After", String(retryAfterSeconds));
  res.status(429).json({
    error: "Too many requests",
    code: "RATE_LIMITED",
    retryAfter: retryAfterSeconds,
    requestId: (req as RequestWithContext).id,
  });
}

/**
 * Sliding-window rate limiter backed by Redis sorted sets.
 * Each request is recorded as a member scored by its timestamp; entries
 * older than `windowMs` are trimmed before counting, giving a true sliding
 * window rather than a fixed-bucket reset.
 *
 * Returns 429 with a `Retry-After` header (seconds) once `max` is exceeded
 * within the window. Fails open if Redis is unavailable.
 */
export function rateLimitMiddleware(options: RateLimitOptions) {
  const { windowMs, max, keyPrefix, keyGenerator = defaultKeyGenerator } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const identifier = keyGenerator(req);
    const key = `ratelimit:${keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      const member = `${now}-${randomBytes(4).toString("hex")}`;

      const results = await redis
        .multi()
        .zremrangebyscore(key, 0, windowStart)
        .zadd(key, now, member)
        .zcard(key)
        .pexpire(key, windowMs)
        .exec();

      const count = (results?.[2]?.[1] as number) ?? 0;

      if (count > max) {
        const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
        const oldestTimestamp = oldest.length > 1 ? Number(oldest[1]) : now;
        const retryAfterSeconds = Math.max(1, Math.ceil((oldestTimestamp + windowMs - now) / 1000));

        sendRateLimited(req, res, retryAfterSeconds);
        return;
      }

      next();
    } catch {
      // Redis unavailable — fail open rather than blocking all traffic.
      next();
    }
  };
}

/**
 * Caps concurrent Server-Sent Event streams per client IP. A Redis counter is
 * incremented when a stream opens and decremented when the client disconnects.
 * The counter carries a TTL so a crashed process cannot hold a slot forever.
 */
export function sseConnectionLimit(options: { max: number; keyPrefix: string; ttlSeconds: number }) {
  const { max, keyPrefix, ttlSeconds } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = `sse:${keyPrefix}:${keyByIp(req)}`;

    try {
      const open = await redis.incr(key);
      await redis.expire(key, ttlSeconds);

      if (open > max) {
        await redis.decr(key);
        sendRateLimited(req, res, 1);
        return;
      }

      let released = false;
      res.once("close", () => {
        if (released) return;
        released = true;
        redis.decr(key).catch(() => undefined);
      });
      next();
    } catch {
      // Redis unavailable — fail open rather than blocking all streams.
      next();
    }
  };
}
