/**
 * Pluggable error reporting. No vendor is hard-wired.
 *
 * Sink selection (per call, from build-time env):
 *  - NEXT_PUBLIC_ERROR_REPORT_URL set  -> POST JSON to that endpoint
 *  - otherwise, development            -> console.error
 *  - otherwise (production default)    -> no-op
 *
 * Context is redacted before it leaves the page: secret keys, signed XDR and
 * full Stellar account addresses are never sent.
 */

export interface ErrorReport {
  name: string;
  message: string;
  stack?: string;
  context: Record<string, unknown>;
  timestamp: string;
}

export type ErrorSink = (report: ErrorReport) => void;

const ACCOUNT_ADDRESS = /\b[GS][A-Z2-7]{55}\b/g;
const SENSITIVE_KEY = /secret|private|seed|xdr|mnemonic|password|token|signature/i;
const LONG_BASE64 = /^[A-Za-z0-9+/=]{100,}$/;
const MAX_STACK_LINES = 10;
const DEDUPE_WINDOW_MS = 5000;

const recent = new Map<string, number>();

export function redactString(value: string): string {
  return value.replace(ACCOUNT_ADDRESS, "[redacted-address]");
}

export function redactContext(input: unknown, depth = 0): unknown {
  if (depth > 5) return "[truncated]";
  if (typeof input === "string") {
    if (LONG_BASE64.test(input)) return "[redacted-blob]";
    return redactString(input);
  }
  if (Array.isArray(input)) return input.map((item) => redactContext(item, depth + 1));
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redactContext(value, depth + 1);
    }
    return out;
  }
  return input;
}

export const consoleSink: ErrorSink = (report) => {
  console.error("[telemetry]", report.name, report.message, report.context);
};

export function httpSink(url: string): ErrorSink {
  return (report) => {
    try {
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Reporting must never throw into the app.
    }
  };
}

export const noopSink: ErrorSink = () => {};

/** Chooses the sink from the given environment. Exported for tests. */
export function selectSink(env: { endpoint?: string; nodeEnv?: string }): ErrorSink {
  if (env.endpoint) return httpSink(env.endpoint);
  if (env.nodeEnv !== "production") return consoleSink;
  return noopSink;
}

function currentSink(): ErrorSink {
  return selectSink({
    endpoint: process.env.NEXT_PUBLIC_ERROR_REPORT_URL || undefined,
    nodeEnv: process.env.NODE_ENV,
  });
}

function fingerprint(error: Error): string {
  return `${error.name}:${error.message}:${(error.stack ?? "").split("\n")[1] ?? ""}`;
}

/**
 * Reports an error with redacted context. Identical errors within a few
 * seconds are sent once, so a render loop does not flood the endpoint.
 */
export function reportError(error: unknown, context: Record<string, unknown> = {}): void {
  const normalised = error instanceof Error ? error : new Error(String(error));
  const key = fingerprint(normalised);
  const now = Date.now();
  const last = recent.get(key);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return;
  recent.set(key, now);

  const stack = normalised.stack
    ?.split("\n")
    .slice(0, MAX_STACK_LINES)
    .map(redactString)
    .join("\n");

  try {
    currentSink()({
      name: normalised.name,
      message: redactString(normalised.message),
      stack,
      context: redactContext(context) as Record<string, unknown>,
      timestamp: new Date(now).toISOString(),
    });
  } catch {
    // Reporting must never break the page that is already failing.
  }
}

/** Test helper: forget previously seen errors. */
export function resetTelemetryDedupe(): void {
  recent.clear();
}
