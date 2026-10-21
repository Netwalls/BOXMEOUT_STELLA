import { randomBytes } from "crypto";
import type { Request, Response, NextFunction } from "express";
import Redis from "ioredis";
import { fail } from "../response";

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  }
  return redis;
}

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

function defaultKeyGenerator(req: Request): string {
  const walletAddress = (req as Request & { walletAddress?: string }).walletAddress;
  return walletAddress ?? req.ip ?? "unknown";
}

/**
 * Sliding-window rate limiter backed by Redis sorted sets.
 * Each request is recorded as a member scored by its timestamp; entries
 * older than `windowMs` are trimmed before counting, giving a true sliding
 * window rather than express-rate-limit's fixed-bucket reset.
 *
 * Returns 429 with a `Retry-After` header (seconds) once `max` is exceeded
 * within the window.
 */
export function rateLimitMiddleware(options: RateLimitOptions) {
  const { windowMs, max, keyPrefix, keyGenerator = defaultKeyGenerator } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const identifier = keyGenerator(req);
    const key = `ratelimit:${keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    const client = getRedis();

    try {
      const member = `${now}-${randomBytes(4).toString("hex")}`;

      const results = await client
        .multi()
        .zremrangebyscore(key, 0, windowStart)
        .zadd(key, now, member)
        .zcard(key)
        .pexpire(key, windowMs)
        .exec();

      const count = (results?.[2]?.[1] as number) ?? 0;

      if (count > max) {
        const oldest = await client.zrange(key, 0, 0, "WITHSCORES");
        const oldestTimestamp = oldest.length > 1 ? Number(oldest[1]) : now;
        const retryAfterSeconds = Math.max(1, Math.ceil((oldestTimestamp + windowMs - now) / 1000));

        res.setHeader("Retry-After", String(retryAfterSeconds));
        fail(res, 429, "RATE_LIMITED", "Too many requests", {
          details: { retryAfter: retryAfterSeconds },
        });
        return;
      }

      next();
    } catch {
      // Redis unavailable — fail open rather than blocking all traffic.
      next();
    }
  };
}
