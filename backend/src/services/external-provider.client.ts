import client from "prom-client";
import type { ZodType } from "zod";
import { logger } from "../logger";

/**
 * B-113 / #1411: resilient JSON client for third-party result providers.
 *
 * Each call gets a request timeout, bounded exponential retries with full
 * jitter, and a per-provider circuit breaker. Responses are validated with
 * zod before the caller sees them, so a malformed provider payload is
 * rejected rather than trusted.
 */

export type CircuitState = "closed" | "open" | "half-open";

/** Timeout, 429, 5xx and network errors. These are retried. */
export class TransientProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransientProviderError";
  }
}

/** Non-retryable 4xx or a response that fails schema validation. */
export class ProviderResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderResponseError";
  }
}

/** Thrown without contacting the provider while the circuit is open. */
export class CircuitOpenError extends Error {
  constructor(provider: string) {
    super(`Circuit open for external provider: ${provider}`);
    this.name = "CircuitOpenError";
  }
}

export interface ProviderClientOptions {
  name: string;
  /** Per-attempt request timeout. */
  timeoutMs?: number;
  /** Retries after the first attempt. */
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Consecutive failed calls before the circuit opens. */
  failureThreshold?: number;
  /** How long the circuit stays open before a single trial call. */
  cooldownMs?: number;
  // Injection points so tests run without real network or wall-clock time.
  fetchImpl?: typeof fetch;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface ProviderClient {
  /** Returns the validated body, or null on 404 (fight not reported yet). */
  getJson<T>(url: string, init: RequestInit, schema: ZodType<T>): Promise<T | null>;
  state(): CircuitState;
}

const circuitGauge = (() => {
  const name = "external_provider_circuit_open";
  const existing = client.register.getSingleMetric(name);
  if (existing) return existing as client.Gauge<"provider">;
  return new client.Gauge({
    name,
    help: "1 when the external provider circuit breaker is open, 0 otherwise",
    labelNames: ["provider"],
  });
})();

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createProviderClient(opts: ProviderClientOptions): ProviderClient {
  const {
    name,
    timeoutMs = 5_000,
    maxRetries = 3,
    baseDelayMs = 500,
    maxDelayMs = 8_000,
    failureThreshold = 5,
    cooldownMs = 30_000,
    fetchImpl = fetch,
    random = Math.random,
    sleep = defaultSleep,
    now = Date.now,
  } = opts;

  let circuit: CircuitState = "closed";
  let consecutiveFailures = 0;
  let openedAt = 0;

  function setCircuit(next: CircuitState): void {
    if (next === circuit) return;
    circuit = next;
    circuitGauge.set({ provider: name }, next === "open" ? 1 : 0);
    logger.warn({ provider: name, circuit: next }, "external provider circuit state changed");
  }

  function beforeCall(): void {
    if (circuit !== "open") return;
    if (now() - openedAt < cooldownMs) throw new CircuitOpenError(name);
    setCircuit("half-open");
  }

  function recordSuccess(): void {
    consecutiveFailures = 0;
    setCircuit("closed");
  }

  function recordFailure(): void {
    consecutiveFailures += 1;
    if (circuit === "half-open" || consecutiveFailures >= failureThreshold) {
      openedAt = now();
      setCircuit("open");
    }
  }

  /** Full jitter: a uniform delay in [0, min(maxDelay, base * 2^attempt)). */
  function backoffMs(attempt: number): number {
    const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
    return Math.floor(random() * cap);
  }

  async function attemptOnce<T>(
    url: string,
    init: RequestInit,
    schema: ZodType<T>,
  ): Promise<T | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let res: Response;
      try {
        res = await fetchImpl(url, { ...init, signal: controller.signal });
      } catch (err) {
        throw new TransientProviderError(
          `Network error or timeout after ${timeoutMs}ms: ${(err as Error).message}`,
        );
      }

      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) {
        throw new TransientProviderError(`HTTP ${res.status}`);
      }
      if (!res.ok) {
        throw new ProviderResponseError(`HTTP ${res.status}`);
      }

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        throw new ProviderResponseError("Response body is not valid JSON");
      }

      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        throw new ProviderResponseError(`Response failed validation: ${parsed.error.message}`);
      }
      return parsed.data;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async getJson<T>(url: string, init: RequestInit, schema: ZodType<T>): Promise<T | null> {
      beforeCall();

      for (let attempt = 0; ; attempt++) {
        try {
          const result = await attemptOnce(url, init, schema);
          recordSuccess();
          return result;
        } catch (err) {
          const retryable = err instanceof TransientProviderError;
          if (!retryable || attempt >= maxRetries) {
            recordFailure();
            logger.error(
              { provider: name, attempt: attempt + 1, err: (err as Error).message },
              "external provider call failed",
            );
            throw err;
          }
          const delay = backoffMs(attempt);
          logger.warn(
            { provider: name, attempt: attempt + 1, delayMs: delay, err: (err as Error).message },
            "external provider call failed, retrying",
          );
          await sleep(delay);
        }
      }
    },

    state(): CircuitState {
      return circuit;
    },
  };
}
