import { randomBytes } from "crypto";
import type { Request, Response, NextFunction } from "express";
import Redis from "ioredis";
import { fail } from "../response";
import { config } from "../../config";
import { logger } from "../../logger";
import { rateLimitRedisErrorsTotal } from "../../metrics";

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  }
  return redis;
}

export type RateLimitFailMode = "open" | "closed";

export interface RateLimitOptions {
  /** Sliding window size in milliseconds. */
  windowMs: number;
  /** Max requests allowed per identifier within the window. */
  max: number;
  /** Namespaces the Redis keys so different route groups don't share limits. */
  keyPrefix: string;
  /** Derives the rate-limit identifier from the request. Defaults to wallet address (if authenticated) or IP. */
  keyGenerator?: (req: Request) => string;
  /**
   * What to do when Redis is unavailable. Defaults to RATE_LIMIT_FAIL_MODE.
   * Write routes pass "closed" so a Redis outage cannot disable their limit.
   */
  failMode?: RateLimitFailMode;
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
 * Every response from a counted request carries the IETF draft headers
 * `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` (seconds).
 * A request over the limit gets 429 and `Retry-After` (seconds).
 *
 * If Redis fails, the error is logged and counted in
 * `rate_limit_redis_errors_total`, then the fail mode decides the outcome:
 * "open" calls next(), "closed" answers 503 RATE_LIMIT_UNAVAILABLE.
 */
export function rateLimitMiddleware(options: RateLimitOptions) {
  const { windowMs, max, keyPrefix, keyGenerator = defaultKeyGenerator } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const identifier = keyGenerator(req);
    const key = `ratelimit:${keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    const failMode: RateLimitFailMode = options.failMode ?? config.RATE_LIMIT_FAIL_MODE;

    let count: number;
    let oldestScore: number;
    try {
      const member = `${now}-${randomBytes(4).toString("hex")}`;

      const results = await getRedis()
        .multi()
        .zremrangebyscore(key, 0, windowStart)
        .zadd(key, now, member)
        .zcard(key)
        .pexpire(key, windowMs)
        .zrange(key, 0, 0, "WITHSCORES")
        .exec();

      if (!results) throw new Error("rate limit pipeline returned no result");
      for (const [err] of results) {
        if (err) throw err;
      }
      count = (results[2]?.[1] as number) ?? 0;
      const oldest = (results[4]?.[1] as string[] | undefined) ?? [];
      oldestScore = oldest.length > 1 ? Number(oldest[1]) : now;
    } catch (err) {
      rateLimitRedisErrorsTotal.inc({ fail_mode: failMode });
      logger.warn(
        { err, keyPrefix, failMode },
        "rate limiter unavailable; applying RATE_LIMIT fail mode",
      );
      if (failMode === "closed") {
        res.setHeader("Retry-After", "1");
        fail(res, 503, "RATE_LIMIT_UNAVAILABLE", "Service temporarily unavailable");
        return;
      }
      next();
      return;
    }

    // Seconds until the oldest request in the window ages out.
    const resetSeconds = Math.max(1, Math.ceil((oldestScore + windowMs - now) / 1000));
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - count)));
    res.setHeader("RateLimit-Reset", String(resetSeconds));

    if (count > max) {
      res.setHeader("Retry-After", String(resetSeconds));
      fail(res, 429, "RATE_LIMITED", "Too many requests", {
        details: { retryAfter: resetSeconds },
      });
      return;
    }

    next();
  };
}
