/**
 * B-61: Prometheus metrics
 *
 * Exposes:
 *   - Default Node.js process metrics (prom-client collectDefaultMetrics)
 *   - httpRequestDuration histogram  — HTTP request latency by method/path/status
 *   - indexerLedgerLag gauge         — latest RPC ledger minus last indexed ledger
 *   - indexerRetentionGap counter    — times the indexer detected an RPC retention gap
 *   - indexerConsecutiveFailures gauge — consecutive indexer RPC failures (B-64)
 *   - indexerLastLedger gauge        — last ledger the indexer has checkpointed
 *   - indexerEventProcessSeconds histogram{type} — per-event handler duration
 *   - sorobanRpcRequestSeconds histogram{method} — Soroban RPC call latency
 *   - lockJobSuccess / lockJobFailure counters
 *   - finalizeJobSuccess / finalizeJobFailure counters
 *
 * All metrics are registered on the default prom-client registry.
 * The /metrics route is exported as an Express Router for use in app.ts.
 */

import { Router } from "express";
import client, { Registry } from "prom-client";
import type { Queue } from "bullmq";
import { db } from "./db";

// ─── Registry & default metrics ───────────────────────────────────────────────

// Use a dedicated registry so tests can create isolated instances
export const metricsRegistry: Registry = new client.Registry();

client.collectDefaultMetrics({ register: metricsRegistry });

// ─── HTTP request duration histogram ─────────────────────────────────────────

export const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request latency in seconds",
  labelNames: ["method", "path", "status"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

// ─── Indexer lag gauge ────────────────────────────────────────────────────────

/**
 * Tracks the difference between the latest ledger seen from the Soroban RPC
 * and the last ledger the indexer successfully processed.
 * A rising value indicates the indexer is falling behind.
 */
export const indexerLedgerLag = new client.Gauge({
  name: "indexer_ledger_lag",
  help: "Number of ledgers between latest RPC ledger and last indexed ledger",
  registers: [metricsRegistry],
});

// ─── Indexer retention gap counter ────────────────────────────────────────────

/**
 * B-63: Incremented whenever the indexer detects that its last indexed ledger
 * is older than the Soroban RPC's oldest retained ledger. This means events in
 * the gap have been pruned by the RPC and must be backfilled from an archive
 * (e.g. Stellar Hubble / history archives) before indexing can resume safely.
 */
export const indexerRetentionGap = new client.Counter({
  name: "indexer_retention_gap_total",
  help: "Total number of detected Soroban RPC event retention gaps",
  registers: [metricsRegistry],
});

// ─── Indexer consecutive RPC failures gauge ───────────────────────────────────

/**
 * B-64: Tracks the current run of consecutive transient RPC failures in the
 * indexer. Reset to 0 on the first successful RPC call. A rising value means
 * the indexer is retrying with jittered exponential backoff.
 */
export const indexerConsecutiveFailures = new client.Gauge({
  name: "indexer_consecutive_failures",
  help: "Current number of consecutive indexer RPC failures",
  registers: [metricsRegistry],
});

// ─── Indexer last-ledger gauge ────────────────────────────────────────────────

/**
 * B-112: The last ledger the indexer has checkpointed. A value that stops
 * changing while the network advances means the indexer has stalled.
 */
export const indexerLastLedger = new client.Gauge({
  name: "indexer_last_ledger",
  help: "Last ledger sequence the indexer has processed and checkpointed",
  registers: [metricsRegistry],
});

// ─── Indexer per-event processing duration ────────────────────────────────────

/**
 * B-112: Time spent handling one event inside the ledger transaction, labelled
 * by canonical event type so slow handlers can be told apart.
 */
export const indexerEventProcessSeconds = new client.Histogram({
  name: "indexer_event_process_seconds",
  help: "Time spent processing one indexed event, by event type",
  labelNames: ["type"],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

// ─── Soroban RPC request latency ──────────────────────────────────────────────

/**
 * B-112: Latency of calls to the Soroban RPC, labelled by method.
 */
export const sorobanRpcRequestSeconds = new client.Histogram({
  name: "soroban_rpc_request_seconds",
  help: "Soroban RPC request latency in seconds, by method",
  labelNames: ["method"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [metricsRegistry],
});

/**
 * Runs a Soroban RPC call and records its duration, whether it succeeds or throws.
 */
export async function observeSorobanRpc<T>(
  method: string,
  call: () => Promise<T>
): Promise<T> {
  const endTimer = sorobanRpcRequestSeconds.startTimer({ method });
  try {
    return await call();
  } finally {
    endTimer();
  }
}

// ─── Job outcome counters ─────────────────────────────────────────────────────

export const lockJobSuccess = new client.Counter({
  name: "lock_job_success_total",
  help: "Total number of successful lock-market job executions",
  registers: [metricsRegistry],
});

export const lockJobFailure = new client.Counter({
  name: "lock_job_failure_total",
  help: "Total number of failed lock-market job executions",
  registers: [metricsRegistry],
});

export const finalizeJobSuccess = new client.Counter({
  name: "finalize_job_success_total",
  help: "Total number of successful finalize-market job executions",
  registers: [metricsRegistry],
});

export const finalizeJobFailure = new client.Counter({
  name: "finalize_job_failure_total",
  help: "Total number of failed finalize-market job executions",
  registers: [metricsRegistry],
});

// ─── Retention pruning ────────────────────────────────────────────────────────

/**
 * B-101: Rows deleted by the daily retention job, labelled by table
 * (AuditLog | EventLog).
 */
export const retentionRowsPruned = new client.Counter({
  name: "retention_rows_pruned_total",
  help: "Total number of rows deleted by the retention pruning job",
  labelNames: ["table"],
  registers: [metricsRegistry],
});

// ─── Business metrics (B-131) ────────────────────────────────────────────────
// Label values are bounded: side and result are fixed sets, status is the
// market enum. Market ids and addresses are never used as labels.

const KNOWN_SIDES = ["FighterA", "FighterB"] as const;

export const betsPlacedTotal = new client.Counter({
  name: "bets_placed_total",
  help: "Bets placed, by side",
  labelNames: ["side"],
  registers: [metricsRegistry],
});

export const betVolumeStroopsTotal = new client.Counter({
  name: "bet_volume_stroops_total",
  help: "Total bet stake placed, in stroops",
  registers: [metricsRegistry],
});

export const oracleSubmissionsTotal = new client.Counter({
  name: "oracle_submissions_total",
  help: "Oracle result submissions, by outcome of the request",
  labelNames: ["result"],
  registers: [metricsRegistry],
});

/**
 * Records one indexed BetPlaced event. Unknown sides and malformed amounts are
 * counted under side="unknown" / skipped for volume rather than dropped.
 */
export function recordBetPlaced(body: unknown): void {
  const { side, amount } = (body ?? {}) as { side?: unknown; amount?: unknown };
  const label = (KNOWN_SIDES as readonly string[]).includes(String(side))
    ? String(side)
    : "unknown";
  betsPlacedTotal.inc({ side: label });

  const stroops = typeof amount === "bigint" || typeof amount === "number" || typeof amount === "string"
    ? Number(amount)
    : NaN;
  if (Number.isFinite(stroops) && stroops > 0) {
    betVolumeStroopsTotal.inc(stroops);
  }
}

export const marketsByStatus = new client.Gauge({
  name: "markets_by_status",
  help: "Current number of markets, by status (sampled on scrape)",
  labelNames: ["status"],
  registers: [metricsRegistry],
  async collect() {
    const rows = await db.market.groupBy({ by: ["status"], _count: { _all: true } });
    this.reset();
    for (const row of rows) {
      this.set({ status: String(row.status) }, row._count._all);
    }
  },
});

let resolutionQueueRef: Queue | null = null;

/** Called by the oracle service once its resolution queue exists. */
export function setResolutionQueueForMetrics(queue: Queue): void {
  resolutionQueueRef = queue;
}

export const resolutionQueueWaiting = new client.Gauge({
  name: "resolution_queue_waiting",
  help: "Resolution jobs waiting to run (sampled on scrape)",
  registers: [metricsRegistry],
  async collect() {
    this.set(resolutionQueueRef ? await resolutionQueueRef.getWaitingCount() : 0);
  },
});

export const resolutionQueueFailed = new client.Gauge({
  name: "resolution_queue_failed",
  help: "Resolution jobs in the failed state (sampled on scrape)",
  registers: [metricsRegistry],
  async collect() {
    this.set(resolutionQueueRef ? await resolutionQueueRef.getFailedCount() : 0);
  },
});

export const sseConnections = new client.Gauge({
  name: "sse_connections",
  help: "Open market SSE connections",
  registers: [metricsRegistry],
});

// ─── /metrics router ──────────────────────────────────────────────────────────

export const metricsRouter = Router();

/**
 * GET /metrics — Prometheus scrape endpoint.
 * Returns all registered metrics in the Prometheus text exposition format.
 */
metricsRouter.get("/metrics", async (_req, res) => {
  try {
    const metrics = await metricsRegistry.metrics();
    res.set("Content-Type", metricsRegistry.contentType);
    res.end(metrics);
  } catch (err) {
    res.status(500).end(String(err));
  }
});
