/**
 * B-140: measures each database query. Records its duration in a histogram and
 * logs queries slower than the threshold. Only the model, action and duration
 * are passed to the logger, never query arguments or parameter values.
 */

export interface QueryTimingDeps {
  /** Queries strictly slower than this many milliseconds are logged. */
  slowMs: number;
  observe: (labels: { model: string; action: string }, seconds: number) => void;
  warn: (fields: { model: string; action: string; durationMs: number }, message: string) => void;
  /** Monotonic clock in milliseconds. Defaults to performance.now(). */
  now?: () => number;
}

export async function timeQuery<T>(
  meta: { model: string | undefined; action: string },
  run: () => Promise<T>,
  deps: QueryTimingDeps,
): Promise<T> {
  const model = meta.model ?? "raw";
  const action = meta.action;
  const now = deps.now ?? (() => performance.now());
  const start = now();

  try {
    return await run();
  } finally {
    const durationMs = now() - start;
    deps.observe({ model, action }, durationMs / 1000);
    if (durationMs > deps.slowMs) {
      deps.warn({ model, action, durationMs: Math.round(durationMs) }, "slow database query");
    }
  }
}
