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
import { db } from "../db";
import { logger } from "../logger";

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
  const account = await server.getAccount(keypair.publicKey());

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

      const prepared = await server.prepareTransaction(tx);
      prepared.sign(keypair);
      const result = await server.sendTransaction(prepared);

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
  const account = await server.getAccount(keypair.publicKey());

  const contract = new Contract(market.contractAddress);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK,
  })
    .addOperation(contract.call("finalize_market"))
    .setTimeout(30)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(keypair);
  const result = await server.sendTransaction(prepared);

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

// ─── Public API ───────────────────────────────────────────────────────────────

/** Interval handle so the jobs can be stopped in tests. */
let

/* … truncated 1363 chars — edit only what you need near the top … */
