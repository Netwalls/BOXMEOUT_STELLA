/**
 * B-157: one shared Soroban RPC client for the whole process.
 *
 * Before this module each caller built its own `SorobanRpc.Server` with its
 * own settings, so there was no shared timeout, retry policy or metrics.
 *
 *   - getRpcServer():   returns a single configured Server instance.
 *                       `allowHttp` is enabled only outside production.
 *   - withRpcRetry(fn): bounded retries with full jitter for transient
 *                       errors. Non-idempotent calls (transaction
 *                       submission) are never retried unless the caller
 *                       passes a `canRetry` guard that proves it is safe.
 *   - Every attempt is bounded by RPC_TIMEOUT_MS and recorded in the shared
 *     Soroban metrics (duration, errors, retries).
 */
import { SorobanRpc } from "@stellar/stellar-sdk";
import { logger } from "../logger";
import { observeSorobanRpc, sorobanRpcErrors, sorobanRpcRetries } from "../metrics";
import { TimeoutError, withTimeout } from "./timeout";

const DEFAULT_RPC_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 250;
const DEFAULT_MAX_DELAY_MS = 2_000;

/** HTTP statuses that indicate the RPC is temporarily unavailable. */
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Node network error codes that are worth retrying. */
const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EPIPE",
]);

let sharedServer: SorobanRpc.Server | null = null;

function rpcTimeoutMs(): number {
  const parsed = parseInt(process.env.RPC_TIMEOUT_MS ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_RPC_TIMEOUT_MS;
}

/**
 * Returns the process-wide Soroban RPC client, creating it on first use.
 * Throws if STELLAR_RPC_URL is not configured.
 */
export function getRpcServer(): SorobanRpc.Server {
  if (sharedServer) return sharedServer;

  const url = process.env.STELLAR_RPC_URL;
  if (!url) {
    throw new Error("STELLAR_RPC_URL environment variable is not set");
  }

  sharedServer = new SorobanRpc.Server(url, {
    allowHttp: process.env.NODE_ENV !== "production",
    timeout: rpcTimeoutMs(),
  });
  return sharedServer;
}

/** Test hook: drops the cached client so the next call rebuilds it. */
export function resetRpcServerForTests(): void {
  sharedServer = null;
}

export interface RpcRetryOptions {
  /** Soroban method or logical operation name, used for metrics and logs. */
  method: string;
  /**
   * True for reads that can safely repeat (getAccount, simulate, getEvents).
   * Only idempotent calls are retried without a guard.
   */
  idempotent?: boolean;
  /** Retries after the first attempt. Default 2. */
  retries?: number;
  /** Base delay for exponential backoff, before jitter. Default 250 ms. */
  baseDelayMs?: number;
  /** Upper bound on any single backoff delay. Default 2000 ms. */
  maxDelayMs?: number;
  /**
   * Required to retry a non-idempotent call such as a transaction submission.
   * Return true only when the failure proves the operation did not take effect
   * (for example, the transaction was never accepted by the network).
   */
  canRetry?: (err: unknown) => boolean | Promise<boolean>;
}

/**
 * Whether an error is worth retrying: timeouts, network resets and 429/5xx
 * responses. Contract or validation errors are never transient.
 */
export function isTransientRpcError(err: unknown): boolean {
  if (err instanceof TimeoutError) return true;
  if (!err || typeof err !== "object") return false;

  const e = err as {
    code?: unknown;
    status?: unknown;
    response?: { status?: unknown };
  };
  const status = typeof e.status === "number" ? e.status : e.response?.status;
  if (typeof status === "number" && TRANSIENT_HTTP_STATUSES.has(status)) return true;
  if (typeof e.code === "string" && TRANSIENT_NETWORK_CODES.has(e.code)) return true;

  return false;
}

function errorReason(err: unknown): string {
  if (err instanceof TimeoutError) return "timeout";
  if (isTransientRpcError(err)) return "transient";
  return "permanent";
}

/** Exponential backoff with full jitter: uniform in [0, min(max, base * 2^n)]. */
export function backoffDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  return Math.floor(Math.random() * ceiling);
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs an RPC call with a per-attempt timeout, metrics and bounded retries.
 *
 * Retry rules:
 *   - A non-transient error is thrown immediately.
 *   - Idempotent calls retry transient errors up to `retries` times.
 *   - Non-idempotent calls retry only when `canRetry` resolves to true.
 */
export async function withRpcRetry<T>(
  fn: () => Promise<T>,
  options: RpcRetryOptions,
): Promise<T> {
  const {
    method,
    idempotent = false,
    retries = DEFAULT_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    canRetry,
  } = options;

  const timeoutMs = rpcTimeoutMs();
  const maxRetries = idempotent || canRetry ? retries : 0;

  for (let attempt = 0; ; attempt++) {
    try {
      return await observeSorobanRpc(method, () =>
        withTimeout(fn(), timeoutMs, `soroban ${method}`),
      );
    } catch (err) {
      sorobanRpcErrors.inc({ method, reason: errorReason(err) });

      if (attempt >= maxRetries || !isTransientRpcError(err)) throw err;
      if (!idempotent && !(await canRetry!(err))) throw err;

      sorobanRpcRetries.inc({ method });
      const delay = backoffDelayMs(attempt, baseDelayMs, maxDelayMs);
      logger.warn({ method, attempt: attempt + 1, delayMs: delay, err }, "retrying soroban rpc call");
      await sleep(delay);
    }
  }
}
