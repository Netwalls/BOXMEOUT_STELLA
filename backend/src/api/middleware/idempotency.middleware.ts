/**
 * B-103: Idempotency-Key support for POST endpoints.
 *
 * Clients retry POST requests after network failures. Without a key, a retry
 * either hits a unique constraint or leaves the client unsure whether the first
 * attempt succeeded. When a request carries an `Idempotency-Key` header:
 *   - the first request runs, and its response is stored in Redis for 24 hours
 *   - a replay with the same key and body returns the stored response, marked
 *     with `Idempotent-Replayed: true`, and the handler does not run again
 *   - the same key with a different body is rejected with 422
 *   - a request that arrives while the first is still running gets 409
 *   - 5xx responses are not stored, so the client can retry the same request
 *
 * Keys are scoped to the authenticated wallet, so two users cannot collide.
 * Run this after walletAuthMiddleware so `req.walletAddress` is set.
 */
import { createHash } from "crypto";
import type { NextFunction, Request, Response } from "express";
import type Redis from "ioredis";
import { redis as sharedRedis } from "../../lib/redis";
import { logger } from "../../logger";

export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
/**
 * How long a request holds its key while running. If the process dies mid-request
 * the key is released after this window instead of staying locked for 24 hours.
 */
export const IDEMPOTENCY_IN_PROGRESS_TTL_SECONDS = 60;
const KEY_PREFIX = "idempotency:";
const MAX_KEY_LENGTH = 255;

/** The subset of Redis commands the middleware uses, so tests can supply a fake. */
export type IdempotencyStore = Pick<Redis, "get" | "set" | "del">;

type StoredRecord =
  | { state: "pending"; fingerprint: string }
  | { state: "complete"; fingerprint: string; statusCode: number; body: unknown };

interface CapturedResponse {
  statusCode?: number;
  body?: unknown;
}

function scopeOf(req: Request): string {
  return (req as Request & { walletAddress?: string }).walletAddress ?? "anonymous";
}

/** Hash of method, path and body, so a reused key with a different request is detected. */
function fingerprintRequest(req: Request): string {
  return createHash("sha256")
    .update(`${req.method} ${req.originalUrl}\n${JSON.stringify(req.body ?? null)}`)
    .digest("hex");
}

function parseRecord(raw: string | null): StoredRecord | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as StoredRecord;
  } catch {
    return null;
  }
}

/**
 * Wraps res.json so the status and body are kept, then stores them once the
 * response finishes. A response that was never sent as JSON, or that failed with
 * a 5xx, releases the key so the client can retry.
 */
function persistResponseOnFinish(
  res: Response,
  store: IdempotencyStore,
  redisKey: string,
  fingerprint: string,
): void {
  const captured: CapturedResponse = {};
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    captured.statusCode = res.statusCode;
    captured.body = body;
    return originalJson(body);
  }) as Response["json"];

  const release = () =>
    store.del(redisKey).catch((err) =>
      logger.warn({ err, redisKey }, "idempotency: failed to release key"),
    );

  res.once("finish", () => {
    if (captured.statusCode === undefined || captured.statusCode >= 500) {
      void release();
      return;
    }
    const record: StoredRecord = {
      state: "complete",
      fingerprint,
      statusCode: captured.statusCode,
      body: captured.body,
    };
    store
      .set(redisKey, JSON.stringify(record), "EX", IDEMPOTENCY_TTL_SECONDS)
      .catch((err) => logger.warn({ err, redisKey }, "idempotency: failed to store response"));
  });

  res.once("close", () => {
    if (!res.writableFinished) void release();
  });
}

/**
 * Builds the middleware. Takes an optional store so tests can run without Redis.
 */
export function idempotencyMiddleware(store: IdempotencyStore = sharedRedis) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.header("Idempotency-Key");
    if (header === undefined) {
      next();
      return;
    }

    const key = header.trim();
    if (key.length === 0 || key.length > MAX_KEY_LENGTH) {
      res.status(400).json({
        error: `Idempotency-Key must be 1-${MAX_KEY_LENGTH} characters`,
        code: "VALIDATION_ERROR",
      });
      return;
    }

    const redisKey = `${KEY_PREFIX}${scopeOf(req)}:${key}`;
    const fingerprint = fingerprintRequest(req);

    let claimed: boolean;
    try {
      const claim = await store.set(
        redisKey,
        JSON.stringify({ state: "pending", fingerprint } satisfies StoredRecord),
        "EX",
        IDEMPOTENCY_IN_PROGRESS_TTL_SECONDS,
        "NX",
      );
      claimed = claim === "OK";

      if (!claimed) {
        const existing = parseRecord(await store.get(redisKey));

        if (existing && existing.fingerprint !== fingerprint) {
          res.status(422).json({
            error: "Idempotency-Key was already used with a different request body",
            code: "IDEMPOTENCY_KEY_MISMATCH",
          });
          return;
        }

        if (existing?.state === "complete") {
          res
            .status(existing.statusCode)
            .set("Idempotent-Replayed", "true")
            .json(existing.body);
          return;
        }

        res.status(409).json({
          error: "A request with this Idempotency-Key is already in progress",
          code: "IDEMPOTENCY_IN_PROGRESS",
        });
        return;
      }
    } catch (err) {
      // Fail open: if Redis is unreachable the request runs without idempotency,
      // which matches the behaviour before this middleware existed.
      logger.warn({ err }, "idempotency store unavailable; processing without idempotency");
      next();
      return;
    }

    persistResponseOnFinish(res, store, redisKey, fingerprint);
    next();
  };
}
