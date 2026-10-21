/**
 * B-101: Daily retention job.
 *
 * AuditLog grows by one row per request and EventLog by one row per on-chain
 * event, with nothing removing them. This service runs once a day as a BullMQ
 * repeatable job and deletes expired rows in batches:
 *   - AuditLog rows older than AUDIT_LOG_RETENTION_DAYS
 *   - processed EventLog rows older than EVENT_LOG_RETENTION_DAYS
 *
 * Only one process runs the job per schedule, because BullMQ dedupes repeatable
 * jobs by their repeat key, so several API replicas can call start safely.
 */
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { config } from "../config";
import { logger } from "../logger";
import { retentionRowsPruned } from "../metrics";
import { pruneAuditLogs, pruneEventLogs } from "./audit.service";

export const RETENTION_QUEUE = "data-retention";
const RETENTION_JOB = "prune-expired-rows";
const RETENTION_SCHEDULE_ID = "data-retention-daily";
/** 03:00 UTC every day. */
const RETENTION_CRON = "0 3 * * *";
const DAY_MS = 24 * 60 * 60 * 1000;

let queue: Queue | null = null;
let worker: Worker | null = null;

/**
 * BullMQ connection options derived from REDIS_URL. Passing options rather than
 * the shared ioredis instance avoids a type clash between the app's ioredis and
 * the copy BullMQ bundles. `maxRetriesPerRequest: null` is required for workers.
 */
function redisConnection(): ConnectionOptions {
  const url = new URL(config.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

export interface RetentionResult {
  auditLogs: number;
  eventLogs: number;
}

/**
 * Deletes every expired AuditLog and EventLog row relative to `now`, and
 * records the number of rows removed per table in `retention_rows_pruned_total`.
 */
export async function runRetention(now: Date = new Date()): Promise<RetentionResult> {
  const auditCutoff = new Date(now.getTime() - config.AUDIT_LOG_RETENTION_DAYS * DAY_MS);
  const eventCutoff = new Date(now.getTime() - config.EVENT_LOG_RETENTION_DAYS * DAY_MS);

  const auditLogs = await pruneAuditLogs(auditCutoff);
  retentionRowsPruned.inc({ table: "AuditLog" }, auditLogs);

  const eventLogs = await pruneEventLogs(eventCutoff);
  retentionRowsPruned.inc({ table: "EventLog" }, eventLogs);

  logger.info(
    { auditLogs, eventLogs, auditCutoff, eventCutoff },
    "retention: pruned expired rows",
  );

  return { auditLogs, eventLogs };
}

/**
 * Registers the daily schedule and starts the worker that executes it.
 */
export async function startRetentionService(): Promise<void> {
  queue = new Queue(RETENTION_QUEUE, { connection: redisConnection() });

  worker = new Worker(
    RETENTION_QUEUE,
    async () => {
      await runRetention();
    },
    { connection: redisConnection() },
  );

  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "retention job failed");
  });

  await queue.add(
    RETENTION_JOB,
    {},
    {
      repeat: { pattern: RETENTION_CRON },
      jobId: RETENTION_SCHEDULE_ID,
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: 30,
      removeOnFail: 30,
    },
  );

  logger.info({ cron: RETENTION_CRON }, "retention service started");
}

/**
 * Stops the worker and queue. A job already in progress finishes first.
 */
export async function stopRetentionService(): Promise<void> {
  await worker?.close();
  await queue?.close();
  worker = null;
  queue = null;
  logger.info("retention service stopped");
}
