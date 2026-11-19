/**
 * Time-boxed Redis access with a database (or other) fallback.
 *
 * `lib/redis.ts` disables reconnect limits (`maxRetriesPerRequest: null`), so
 * while Redis is down a command can queue indefinitely. Callers that treat
 * Redis as a cache must therefore never await it unbounded: `guardRedis`
 * races the operation against a short deadline and returns the fallback
 * value instead of propagating the outage.
 */
import { logger } from "../logger";

export const REDIS_OP_TIMEOUT_MS = Number(process.env.REDIS_OP_TIMEOUT_MS ?? 250);

/**
 * Runs `op` with a deadline. Resolves with `fallback` if the operation rejects
 * or does not settle within `timeoutMs`.
 */
export async function guardRedis<T>(
  feature: string,
  op: () => Promise<T>,
  fallback: T,
  timeoutMs: number = REDIS_OP_TIMEOUT_MS
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      op(),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          logger.warn({ feature, timeoutMs }, "redis operation timed out; using fallback");
          resolve(fallback);
        }, timeoutMs);
      }),
    ]);
  } catch (err) {
    logger.warn({ err, feature }, "redis operation failed; using fallback");
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
