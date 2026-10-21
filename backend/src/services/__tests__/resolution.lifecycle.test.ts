/**
 * B-111 / #1409: lifecycle jobs run as BullMQ repeatable jobs, are
 * single-flight across replicas, and increment the job metrics.
 *
 * BullMQ, Redis, Prisma, the Stellar SDK and the logger are mocked, so no
 * broker, database or network is needed. Fake timers keep the run
 * deterministic.
 */
import type { Job } from "bullmq";
import { Worker } from "bullmq";
import {
  startResolutionService,
  stopResolutionService,
  LIFECYCLE_QUEUE,
  LOCK_JOB_NAME,
  FINALIZE_JOB_NAME,
} from "../resolution.service";
import {
  lockJobSuccess,
  lockJobFailure,
  finalizeJobSuccess,
  finalizeJobFailure,
} from "../../metrics";

// ── Mocks ─────────────────────────────────────────────────────────────────────
// Factories only reference `mock*` variables inside arrow functions, which run
// after module initialisation, so the hoisted jest.mock calls stay safe.

const mockUpsertJobScheduler = jest.fn();
const mockRemoveJobScheduler = jest.fn();
const mockWorkerClose = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisEval = jest.fn();
const mockFindMany = jest.fn();

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    getJob: jest.fn(),
    getFailed: jest.fn(),
    upsertJobScheduler: (...args: unknown[]) => mockUpsertJobScheduler(...args),
    removeJobScheduler: (...args: unknown[]) => mockRemoveJobScheduler(...args),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: (...args: unknown[]) => mockWorkerClose(...args),
  })),
}));

jest.mock("../../lib/redis", () => ({
  redis: {
    set: (...args: unknown[]) => mockRedisSet(...args),
    eval: (...args: unknown[]) => mockRedisEval(...args),
  },
}));

jest.mock("../../db", () => ({
  db: {
    market: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: jest.fn(),
    },
  },
}));

jest.mock("@prisma/client", () => ({
  MarketStatus: { Open: "Open", Locked: "Locked", Resolved: "Resolved" },
}));

jest.mock("@stellar/stellar-sdk", () => ({
  SorobanRpc: { Server: jest.fn() },
  TransactionBuilder: jest.fn(),
  Networks: { PUBLIC: "public", TESTNET: "testnet" },
  Contract: jest.fn(),
  Keypair: { fromSecret: jest.fn() },
  BASE_FEE: "100",
}));

jest.mock("../../logger", () => ({
  logger: { info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const ONE_MINUTE_MS = 60_000;
const FIVE_MINUTES_MS = 5 * 60_000;

async function counterTotal(counter: { get: () => Promise<{ values: { value: number }[] }> }) {
  const { values } = await counter.get();
  return values.reduce((sum, v) => sum + v.value, 0);
}

/** The processor BullMQ would call for the lifecycle queue. */
function lifecycleProcessor(): (job: Job) => Promise<void> {
  const call = (Worker as unknown as jest.Mock).mock.calls.find(
    ([queueName]) => queueName === LIFECYCLE_QUEUE
  );
  if (!call) throw new Error("lifecycle worker was not created");
  return call[1] as (job: Job) => Promise<void>;
}

function jobNamed(name: string): Job {
  return { name } as unknown as Job;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("B-111 / #1409: scheduled lifecycle jobs", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockRedisSet.mockResolvedValue("OK");
    mockRedisEval.mockResolvedValue(1);
    mockFindMany.mockResolvedValue([]);
    lockJobSuccess.reset();
    lockJobFailure.reset();
    finalizeJobSuccess.reset();
    finalizeJobFailure.reset();
  });

  afterEach(async () => {
    await stopResolutionService();
    jest.useRealTimers();
  });

  it("registers both repeatable jobs at one-minute intervals on startup", async () => {
    await startResolutionService();

    expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
      LOCK_JOB_NAME,
      { every: ONE_MINUTE_MS },
      { name: LOCK_JOB_NAME, data: {} }
    );
    expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
      FINALIZE_JOB_NAME,
      { every: ONE_MINUTE_MS },
      { name: FINALIZE_JOB_NAME, data: {} }
    );
  });

  it("removes both repeatable jobs and closes the worker on shutdown", async () => {
    await startResolutionService();
    await stopResolutionService();

    expect(mockRemoveJobScheduler).toHaveBeenCalledWith(LOCK_JOB_NAME);
    expect(mockRemoveJobScheduler).toHaveBeenCalledWith(FINALIZE_JOB_NAME);
    expect(mockWorkerClose).toHaveBeenCalledTimes(1);
  });

  it("increments the lock success counter after a successful run", async () => {
    await startResolutionService();
    await lifecycleProcessor()(jobNamed(LOCK_JOB_NAME));

    expect(await counterTotal(lockJobSuccess)).toBe(1);
    expect(await counterTotal(lockJobFailure)).toBe(0);
    expect(mockRedisSet).toHaveBeenCalledWith(
      `lifecycle-lock:${LOCK_JOB_NAME}`,
      expect.any(String),
      "PX",
      FIVE_MINUTES_MS,
      "NX"
    );
    expect(mockRedisEval).toHaveBeenCalledTimes(1);
  });

  it("increments the finalize failure counter when the run throws", async () => {
    mockFindMany.mockRejectedValue(new Error("db unavailable"));
    await startResolutionService();

    await expect(lifecycleProcessor()(jobNamed(FINALIZE_JOB_NAME))).rejects.toThrow(
      "db unavailable"
    );

    expect(await counterTotal(finalizeJobFailure)).toBe(1);
    expect(await counterTotal(finalizeJobSuccess)).toBe(0);
  });

  it("releases the lock even when the run fails", async () => {
    mockFindMany.mockRejectedValue(new Error("db unavailable"));
    await startResolutionService();

    await expect(lifecycleProcessor()(jobNamed(LOCK_JOB_NAME))).rejects.toThrow();

    expect(mockRedisEval).toHaveBeenCalledTimes(1);
  });

  it("skips a tick without touching markets when another replica holds the lock", async () => {
    mockRedisSet.mockResolvedValue(null);
    await startResolutionService();

    await lifecycleProcessor()(jobNamed(LOCK_JOB_NAME));

    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockRedisEval).not.toHaveBeenCalled();
    expect(await counterTotal(lockJobSuccess)).toBe(0);
    expect(await counterTotal(lockJobFailure)).toBe(0);
  });

  it("rejects an unknown job name instead of silently succeeding", async () => {
    await startResolutionService();

    await expect(lifecycleProcessor()(jobNamed("not-a-lifecycle-job"))).rejects.toThrow(
      "unknown lifecycle job"
    );
  });
});
