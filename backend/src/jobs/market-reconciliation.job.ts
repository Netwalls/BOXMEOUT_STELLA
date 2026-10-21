import { MarketStatus } from "@prisma/client";
import { Job, Queue, Worker } from "bullmq";
import { db } from "../db";
import { logger } from "../logger";
import { readOnChainMarket } from "../services/market-chain.reader";
import {
  createReconciler,
  DbMarket,
  ReconcilerDeps,
} from "../services/market-reconciliation.service";

/**
 * B-114 / #1412: nightly reconciliation of database markets against on-chain
 * state. Runs as a BullMQ repeatable job so only one instance fires per
 * schedule, even with several API replicas.
 *
 * Set MARKET_RECONCILE_AUTO_REPAIR=true to overwrite drifted DB rows with the
 * on-chain values. The default is report-only.
 */

export const RECONCILIATION_QUEUE = "market-reconciliation";
export const RECONCILIATION_SCHEDULE_ID = "market-reconciliation-nightly";
/** 03:00 every day, server time. */
export const RECONCILIATION_CRON = "0 3 * * *";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const OPEN_STATUSES: MarketStatus[] = ["Open", "Locked", "Disputed"];

function createDbReconcilerDeps(): ReconcilerDeps {
  return {
    async loadMarket(marketId) {
      const market = await db.market.findUnique({ where: { id: marketId } });
      return market as DbMarket | null;
    },
    async sampleMarkets({ since, take }) {
      const markets = await db.market.findMany({
        where: {
          OR: [{ status: { in: OPEN_STATUSES } }, { scheduledAt: { gte: since } }],
        },
        orderBy: { scheduledAt: "desc" },
        take,
      });
      return markets as DbMarket[];
    },
    async repairMarket(marketId, data) {
      await db.market.update({ where: { id: marketId }, data });
    },
    readOnChain: readOnChainMarket,
  };
}

export const reconciler = createReconciler(createDbReconcilerDeps());

export const reconciliationQueue = new Queue(RECONCILIATION_QUEUE, {
  connection: { url: REDIS_URL },
  defaultJobOptions: { attempts: 1, removeOnComplete: 30, removeOnFail: 30 },
});

export const reconciliationWorker = new Worker(
  RECONCILIATION_QUEUE,
  async (_job: Job) => {
    const autoRepair = process.env.MARKET_RECONCILE_AUTO_REPAIR === "true";
    await reconciler.runSweep({ autoRepair });
  },
  { connection: { url: REDIS_URL } },
);

reconciliationWorker.on("failed", (job, err) => {
  logger.error(
    { jobId: job?.id, err: err.message },
    "market reconciliation sweep failed",
  );
});

export async function startMarketReconciliationSchedule(): Promise<void> {
  await reconciliationQueue.add(
    "sweep",
    {},
    { repeat: { pattern: RECONCILIATION_CRON }, jobId: RECONCILIATION_SCHEDULE_ID },
  );
  logger.info({ cron: RECONCILIATION_CRON }, "market reconciliation schedule registered");
}

export async function stopMarketReconciliationSchedule(): Promise<void> {
  await reconciliationWorker.close();
  await reconciliationQueue.close();
}
