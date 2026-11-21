/**
 * Time-boxed Redis access with explicit per-feature failure policy.
 *
 * `lib/redis.ts` sets `maxRetriesPerRequest: null` (BullMQ requires it), so
 * while Redis is unreachable a command queues instead of failing. Awaiting it
 * directly therefore hangs the request rather than triggering a catch block.
 * Every Redis call that can run on a request path goes through one of the two
 * helpers here, which:
 *
 *   - give the command a deadline (REDIS_OP_TIMEOUT_MS, default 250 ms);
 *   - count the failure in `redis_errors_total{feature}`;
 *   - apply the feature's policy: `guardRedis` fails open with a fallback
 *     value, `requireRedis` fails closed with a 503 RedisUnavailableError.
 *
 * The per-feature policy table is in docs/redis-failure-modes.md.
 */
import { AppError } from "../errors";
import { logger } from "../logger";
import { redisErrorsTotal } from "../metrics";

export const REDIS_OP_TIMEOUT_MS = Number(process.env.REDIS_OP_TIMEOUT_MS ?? 250);

/** Raised by fail-closed features when Redis is unavailable. Maps to HTTP 503. */
export class RedisUnavailableError extends AppError {
  constructor(public readonly feature: string) {
    super("Service temporarily unavailable", 503, "SERVICE_UNAVAILABLE");
  }
}

type Attempt<T> = { ok: true; value: T } | { ok: false; reason: "error" | "timeout"; error?: unknown };

/**
 * Runs `op` under a deadline and never rejects. A failed or timed-out attempt
 * is counted and logged. A late rejection after the deadline is absorbed here,
 * so it cannot surface as an unhandled promise rejection.
 */
async function attempt<T>(
  feature: string,
  op: () => Promise<T>,
  timeoutMs: number
): Promise<Attempt<T>> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<Attempt<T>>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, reason: "timeout" }), timeoutMs);
  });
  const run = Promise.resolve()
    .then(op)
    .then<Attempt<T>, Attempt<T>>(
      (value) => ({ ok: true, value }),
      (error: unknown) => ({ ok: false, reason: "error", error })
    );

  try {
    const result = await Promise.race([run, deadline]);
    if (!result.ok) {
      redisErrorsTotal.inc({ feature });
      logger.warn(
        { feature, reason: result.reason, err: result.reason === "error" ? result.error : undefined },
        "redis operation failed"
      );
    }
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Fail-open access: resolves with `fallback` when Redis errors or does not
 * answer within the deadline. Use for caches and best-effort features.
 */
export async function guardRedis<T>(
  feature: string,
  op: () => Promise<T>,
  fallback: T,
  timeoutMs: number = REDIS_OP_TIMEOUT_MS
): Promise<T> {
  const result = await attempt(feature, op, timeoutMs);
  return result.ok ? result.value : fallback;
}

/**
 * Fail-closed access: resolves with the value, or throws
 * RedisUnavailableError (HTTP 503) when Redis errors or times out.
 */
export async function requireRedis<T>(
  feature: string,
  op: () => Promise<T>,
  timeoutMs: number = REDIS_OP_TIMEOUT_MS
): Promise<T> {
  const result = await attempt(feature, op, timeoutMs);
  if (result.ok) return result.value;
  throw new RedisUnavailableError(feature);
}
