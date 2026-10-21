/**
 * ResolutionService
 *
 * Implements two scheduled cron jobs:
 *
 * enforceMarketLocks (#1086)
 *   — Runs every minute. Finds all Open markets whose bettingEndsAt has passed
 *     and calls lock_market on the Soroban contract. Batches multiple markets
 *     per run. Uses exponential fee backoff with a hard cap.
 *
 * autoFinalizeExpiredWindows (#1085)
 *   — Runs every minute. Finds all Locked markets whose dispute window has
 *     elapsed with no active dispute and finalises them by setting status to
 *     Resolved with the oracle-confirmed outcome. Idempotent: a market that is
 *     already Resolved is never touched again.
 *
 * Oracle result submission retry/idempotency (#1257)
 *   — resolve_market submissions are enqueued in BullMQ with retries and
 *     exponential backoff. An idempotency key per market prevents double
 *     submission, and failed jobs can be inspected and retried via the admin
 *     endpoint exposed by the resolution router.
 */

import {
  SorobanRpc,
  TransactionBuilder,
  Networks,
  Contract,
  Keypair,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { MarketStatus } from "@prisma/client";
import { Queue, Worker, Job } from "bullmq";
import type { Counter } from "prom-client";
import { randomUUID } from "crypto";
import { db } from "../db";
import { config } from "../config";
import { logger } from "../logger";
import { redis } from "../lib/redis";
import {
  lockJobSuccess,
  lockJobFailure,
  finalizeJobSuccess,
  finalizeJobFailure,
} from "../metrics";

// ─── Config ───────────────────────────────────────────────────────────────────

const RPC_URL = process.env.STELLAR_RPC_URL!;
const NETWORK =
  process.env.STELLAR_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY!;

/** Dispute window in milliseconds (default 24 h). */
const DISPUTE_WINDOW_MS =
  parseInt(process.env.DISPUTE_WINDOW_MS ?? "86400000", 10);

const MAX_RETRIES = 3;
/** Hard cap on fee regardless of backoff (in stroops). */
const MAX_FEE = 1_000_000;

/** Redis connection for the oracle submission queue. */
const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST ?? "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
};

/** Queue name for oracle result submissions. */
export const ORACLE_SUBMISSION_QUEUE = "oracle-result-submission";

// ─── Oracle submission queue (#1257) ──────────────────────────────────────────

/**
 * BullMQ queue used to submit resolve_market results to the chain with
 * retries and exponential backoff. Jobs are keyed by market id so a market
 * can never be submitted twice.
 */
export const oracleSubmissionQueue = new Queue(ORACLE_SUBMISSION_QUEUE, {
  connection: REDIS_CONNECTION,
  defaultJobOptions: {
    attempts: MAX_RETRIES + 1,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

/**
 * Enqueues a resolve_market submission for the given market.
 *
 * The job id is derived from the market id, which acts as the idempotency
 * key: BullMQ ignores a second add() with the same job id, so a market can
 * never be submitted twice even if this is called concurrently.
 */
export async function enqueueOracleSubmission(marketId: string): Promise<void> {
  await oracleSubmissionQueue.add(
    "resolve_market",
    { marketId },
    { jobId: `resolve_market:${marketId}` }
  );
  logger.info({ marketId }, "oracle result submission enqueued");
}

/**
 * Worker that performs the actual resolve_market submission. Retries and
 * backoff are handled by BullMQ; the worker only needs to throw on failure.
 */
export const oracleSubmissionWorker = new Worker(
  ORACLE_SUBMISSION_QUEUE,
  async (job: Job<{ marketId: string }>) => {
    const { marketId } = job.data;
    const market = await db.market.findUnique({
      where: { id: marketId },
      include: { oracleResult: true },
    });

    if (!market || !market.oracleResult) {
      throw new Error(`oracle result missing for market ${marketId}`);
    }

    const server = new SorobanRpc.Server(RPC_URL);
    const keypair = Keypair.fromSecret(ADMIN_SECRET);
    await finalizeMarketOnChain(server, keypair, market);

    logger.info({ marketId }, "oracle result submitted on-chain");
  },
  { connection: REDIS_CONNECTION }
);

oracleSubmissionWorker.on("failed", (job, err) => {
  logger.error(
    { err, marketId: job?.data?.marketId, attempts: job?.attemptsMade },
    "oracle result submission failed"
  );
});

/**
 * Lists failed oracle submission jobs so an admin can inspect them.
 */
export async function listFailedOracleSubmissions(): Promise<
  Array<{ id: string; marketId: string; attemptsMade: number; failedReason?: string }>
> {
  const jobs = await oracleSubmissionQueue.getFailed();
  return jobs.map((job) => ({
    id: job.id ?? "",
    marketId: job.data.marketId,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
  }));
}

/**
 * Retries a single failed oracle submission job by id.
 */
export async function retryFailedOracleSubmission(jobId: string): Promise<void> {
  const job = await oracleSubmissionQueue.getJob(jobId);
  if (!job) {
    throw new Error(`oracle submission job ${jobId} not found`);
  }
  await job.retry();
  logger.info({ jobId }, "oracle result submission retried");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calls lock_market on the Soroban contract with exponential fee backoff.
 * Retries up to MAX_RETRIES times before throwing.
 */
async function lockMarketOnChain(
  server: SorobanRpc.Server,
  keypair: Keypair,
  market: { id: string; contractAddress: string }
): Promise<void> {
  const account = await withTimeout(
    server.getAccount(keypair.publicKey()),
    config.RPC_TIMEOUT_MS,
    "rpc getAccount",
  );

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const fee = Math.min(
      Number(BASE_FEE) * Math.pow(2, attempt),
      MAX_FEE
    ).toString();

    try {
      const contract = new Contract(market.contractAddress);
      const tx = new TransactionBuilder(account, {
        fee,
        networkPassphrase: NETWORK,
      })
        .addOperation(contract.call("lock_market"))
        .setTimeout(30)
        .build();

      const prepared = await withTimeout(
        server.prepareTransaction(tx),
        config.RPC_TIMEOUT_MS,
        "rpc prepareTransaction",
      );
      prepared.sign(keypair);
      const result = await withTimeout(
        server.sendTransaction(prepared),
        config.RPC_TIMEOUT_MS,
        "rpc sendTransaction",
      );

      logger.info(
        { marketId: market.id, txHash: result.hash },
        "market locked on-chain"
      );
      return;
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      logger.warn(
        { marketId: market.id, attempt: attempt + 1 },
        "lock_market attempt failed, retrying with higher fee"
      );
    }
  }
}

/**
 * Calls finalize_market on the Soroban contract.
 * If the contract call fails we still update the DB status so the job is
 * idempotent — a failed on-chain call should be retried by the next run.
 */
async function finalizeMarketOnChain(
  server: SorobanRpc.Server,
  keypair: Keypair,
  market: { id: string; contractAddress: string }
): Promise<void> {
  const account = await withTimeout(
    server.getAccount(keypair.publicKey()),
    config.RPC_TIMEOUT_MS,
    "rpc getAccount",
  );

  const contract = new Contract(market.contractAddress);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK,
  })
    .addOperation(contract.call("finalize_market"))
    .setTimeout(30)
    .build();

  const prepared = await withTimeout(
    server.prepareTransaction(tx),
    config.RPC_TIMEOUT_MS,
    "rpc prepareTransaction",
  );
  prepared.sign(keypair);
  const result = await withTimeout(
    server.sendTransaction(prepared),
    config.RPC_TIMEOUT_MS,
    "rpc sendTransaction",
  );

  logger.info(
    { marketId: market.id, txHash: result.hash },
    "market finalized on-chain"
  );
}

// ─── Cron job implementations ─────────────────────────────────────────────────

/**
 * enforceMarketLocks  (#1086)
 *
 * Finds all Open markets whose bettingEndsAt is in the past and locks them
 * on-chain in a single batch. Safe to run every minute.
 */
async function enforceMarketLocks(): Promise<void> {
  const now = new Date();

  const markets = await db.market.findMany({
    where: {
      status: MarketStatus.Open,
      bettingEndsAt: { lt: now },
    },
    select: { id: true, contractAddress: true },
  });

  if (markets.length === 0) {
    logger.debug("enforceMarketLocks: no markets due for locking");
    return;
  }

  logger.info({ count: markets.length }, "enforceMarketLocks: locking markets");

  const server = new SorobanRpc.Server(RPC_URL);
  const keypair = Keypair.fromSecret(ADMIN_SECRET);

  // Process all due markets in this batch run
  const results = await Promise.allSettled(
    markets.map(async (market) => {
      try {
        await lockMarketOnChain(server, keypair, market);
        // Update DB status to Locked after successful on-chain call
        await db.market.update({
          where: { id: market.id },
          data: { status: MarketStatus.Locked },
        });
        logger.info({ marketId: market.id }, "market status updated to Locked");
      } catch (err) {
        logger.error({ err, marketId: market.id }, "failed to lock market");
        throw err;
      }
    })
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    logger.warn({ failed, total: markets.length }, "enforceMarketLocks: some markets failed to lock");
  }
}

/**
 * autoFinalizeExpiredWindows  (#1085)
 *
 * Finds all Locked markets whose oracle result is confirmed and whose dispute
 * window has elapsed without an open dispute. Marks them as Resolved.
 *
 * Idempotent: only Locked markets are queried — Resolved markets are never
 * touched again, so double-runs have no effect.
 */
async function autoFinalizeExpiredWindows(): Promise<void> {
  const now = new Date();
  const windowCutoff = new Date(now.getTime() - DISPUTE_WINDOW_MS);

  // Find Locked markets with a confirmed oracle result whose resolve time
  // (bettingEndsAt + dispute window) has passed and no open dispute exists.
  const markets = await db.market.findMany({
    where: {
      status: MarketStatus.Locked,
      bettingEndsAt: { lt: windowCutoff },
      oracleResult: {
        confirmed: true,
      },
      disputes: {
        none: {
          resolvedAt: null, // no unresolved disputes
        },
      },
    },
    include: {
      oracleResult: true,
    },
  });

  if (markets.length === 0) {
    logger.debug("autoFinalizeExpiredWindows: no markets to finalize");
    return;
  }

  logger.info({ count: markets.length }, "autoFinalizeExpiredWindows: finalizing markets");

  await Promise.allSettled(
    markets.map(async (market) => {
      if (!market.oracleResult) return; // type guard

      try {
        // Enqueue the on-chain resolve_market submission with retries and
        // backoff. The per-market idempotency key prevents double submission.
        await enqueueOracleSubmission(market.id);

        // Mark as Resolved in the database — idempotent because next query
        // filters only Locked markets.
        await db.market.update({
          where: { id: market.id },
          data: {
            status: MarketStatus.Resolved,
            outcome: market.oracleResult.outcome,
            resolvedAt: now,
          },
        });

        logger.info(
          { marketId: market.id, outcome: market.oracleResult.outcome },
          "market finalized and resolved"
        );
      } catch (err) {
        logger.error({ err, marketId: market.id }, "failed to finalize market");
      }
    })
  );
}

// ─── Scheduled lifecycle jobs (B-111) ─────────────────────────────────────────

/** BullMQ queue that carries the repeatable market lifecycle jobs. */
export const LIFECYCLE_QUEUE = "market-lifecycle";
export const LOCK_JOB_NAME = "enforce-market-locks";
export const FINALIZE_JOB_NAME = "auto-finalize-expired-windows";

/** How often each lifecycle job runs. Defaults to one minute. */
export const LIFECYCLE_INTERVAL_MS = parseInt(
  process.env.LIFECYCLE_JOB_INTERVAL_MS ?? "60000",
  10
);

/**
 * TTL of the cross-replica single-flight lock. Longer than any single run so
 * the lock cannot expire while the holder is still working.
 */
const SINGLE_FLIGHT_TTL_MS = 5 * 60_000;

/** Deletes the lock only if this run still owns it (compare-and-delete). */
const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

/**
 * Queue that holds the repeatable lifecycle jobs. Job schedulers keep exactly
 * one scheduled job per name in Redis, so registering on every replica is
 * idempotent: each tick produces one job, and any replica's worker may take it.
 */
export const lifecycleQueue = new Queue(LIFECYCLE_QUEUE, {
  connection: REDIS_CONNECTION,
});

let lifecycleWorker: Worker | null = null;

/**
 * Runs `fn` only if no other replica currently holds the lock for `name`.
 * Returns false when the lock is held elsewhere, so an overlapping tick is
 * skipped instead of processing the same markets twice.
 */
export async function runSingleFlight(
  name: string,
  fn: () => Promise<void>
): Promise<boolean> {
  const key = `lifecycle-lock:${name}`;
  const token = randomUUID();

  const acquired = await redis.set(key, token, "PX", SINGLE_FLIGHT_TTL_MS, "NX");
  if (acquired !== "OK") return false;

  try {
    await fn();
  } finally {
    await redis.eval(RELEASE_LOCK_SCRIPT, 1, key, token);
  }
  return true;
}

/**
 * Dispatches a lifecycle job to its handler, runs it under the single-flight
 * lock, and records the outcome in the job counters.
 */
export async function processLifecycleJob(job: Job): Promise<void> {
  switch (job.name) {
    case LOCK_JOB_NAME:
      return runTrackedJob(LOCK_JOB_NAME, lockJobSuccess, lockJobFailure, enforceMarketLocks);
    case FINALIZE_JOB_NAME:
      return runTrackedJob(
        FINALIZE_JOB_NAME,
        finalizeJobSuccess,
        finalizeJobFailure,
        autoFinalizeExpiredWindows
      );
    default:
      throw new Error(`unknown lifecycle job: ${job.name}`);
  }
}

async function runTrackedJob(
  name: string,
  success: Counter<string>,
  failure: Counter<string>,
  fn: () => Promise<void>
): Promise<void> {
  try {
    const ran = await runSingleFlight(name, fn);
    if (!ran) {
      logger.debug({ job: name }, "lifecycle job skipped: another replica is running it");
      return;
    }
    success.inc();
  } catch (err) {
    failure.inc();
    throw err;
  }
}

/**
 * Registers the repeatable lifecycle jobs and starts the worker that runs
 * them. Safe to call on every replica at startup.
 */
export async function startResolutionService(): Promise<void> {
  for (const name of [LOCK_JOB_NAME, FINALIZE_JOB_NAME]) {
    await lifecycleQueue.upsertJobScheduler(
      name,
      { every: LIFECYCLE_INTERVAL_MS },
      { name, data: {} }
    );
  }

  if (!lifecycleWorker) {
    // Concurrency 1: a replica never runs two lifecycle jobs at once.
    lifecycleWorker = new Worker(LIFECYCLE_QUEUE, processLifecycleJob, {
      connection: REDIS_CONNECTION,
      concurrency: 1,
    });
    lifecycleWorker.on("failed", (job, err) => {
      logger.error({ err, job: job?.name }, "lifecycle job failed");
    });
  }

  logger.info(
    { intervalMs: LIFECYCLE_INTERVAL_MS },
    "ResolutionService started (enforceMarketLocks + autoFinalizeExpiredWindows)"
  );
}

/**
 * Removes the repeatable lifecycle jobs and closes the worker. Called on
 * graceful shutdown.
 */
export async function stopResolutionService(): Promise<void> {
  for (const name of [LOCK_JOB_NAME, FINALIZE_JOB_NAME]) {
    await lifecycleQueue.removeJobScheduler(name);
  }

  if (lifecycleWorker) {
    await lifecycleWorker.close();
    lifecycleWorker = null;
  }
  logger.info("ResolutionService stopped");
}

// Export internal functions for unit testing
export { enforceMarketLocks, autoFinalizeExpiredWindows };
