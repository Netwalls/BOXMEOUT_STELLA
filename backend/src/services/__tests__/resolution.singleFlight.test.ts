/**
 * #1582: scheduled jobs run once across replicas.
 *
 * The lock is exercised against an in-memory Redis stand-in that implements
 * the subset the code uses: `SET key value PX ms NX` with expiry, and the two
 * Lua scripts, recognised by content (compare-and-delete and
 * compare-and-pexpire). Expiry follows the fake clock, so "crashed holder"
 * and "renewal" cases are deterministic. BullMQ, Prisma, the Stellar SDK and
 * the logger are mocked; no broker, database or network is needed.
 */
import type { Job } from "bullmq";
import {
  runSingleFlight,
  processLifecycleJob,
  LOCK_JOB_NAME,
} from "../resolution.service";
import { lifecycleLockSkipped } from "../../metrics";

// ── Mocks ─────────────────────────────────────────────────────────────────────
// Factories only reference `mock*` variables inside arrow functions, which run
// after module initialisation, so the hoisted jest.mock calls stay safe.

type Entry = { value: string; expiresAt: number };
const mockStore = new Map<string, Entry>();

/** Returns the live entry for `key`, dropping it first if its TTL has passed. */
function liveEntry(key: string): Entry | undefined {
  const entry = mockStore.get(key);
  if (entry && entry.expiresAt <= Date.now()) {
    mockStore.delete(key);
    return undefined;
  }
  return entry;
}

const mockRedis = {
  set: jest.fn(async (key: string, value: string, _px: string, ttlMs: number) => {
    if (liveEntry(key)) return null;
    mockStore.set(key, { value, expiresAt: Date.now() + ttlMs });
    return "OK";
  }),
  eval: jest.fn(async (script: string, _numKeys: number, key: string, ...args: string[]) => {
    const entry = liveEntry(key);
    if (script.includes("pexpire")) {
      if (entry && entry.value === args[0]) {
        entry.expiresAt = Date.now() + Number(args[1]);
        return 1;
      }
      return 0;
    }
    if (script.includes('"del"')) {
      if (entry && entry.value === args[0]) {
        mockStore.delete(key);
        return 1;
      }
      return 0;
    }
    throw new Error("unexpected script");
  }),
};

jest.mock("../../lib/redis", () => ({
  redis: {
    set: (...args: unknown[]) => (mockRedis.set as (...a: unknown[]) => unknown)(...args),
    eval: (...args: unknown[]) => (mockRedis.eval as (...a: unknown[]) => unknown)(...args),
  },
}));

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    getJob: jest.fn(),
    getFailed: jest.fn(),
    upsertJobScheduler: jest.fn(),
    removeJobScheduler: jest.fn(),
  })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
}));

jest.mock("../../db", () => ({
  db: { market: { findMany: jest.fn(), update: jest.fn() } },
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

/** The lock TTL in resolution.service.ts (5 minutes). */
const TTL_MS = 5 * 60_000;
const LOCK_KEY = `lifecycle-lock:${LOCK_JOB_NAME}`;

/** Lets pending promise continuations run. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

async function skippedCount(job: string): Promise<number> {
  const { values } = await lifecycleLockSkipped.get();
  return values
    .filter((v) => v.labels.job === job)
    .reduce((sum, v) => sum + v.value, 0);
}

function renewCalls(): number {
  return mockRedis.eval.mock.calls.filter(([script]) => String(script).includes("pexpire")).length;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("#1582: distributed single-flight for scheduled jobs", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-11-19T00:00:00Z") });
    mockStore.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("runs the body once when two replicas race for the same tick", async () => {
    let finish!: () => void;
    const body = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));

    const first = runSingleFlight(LOCK_JOB_NAME, body);
    const second = runSingleFlight(LOCK_JOB_NAME, body);

    await expect(second).resolves.toBe(false);
    finish();
    await expect(first).resolves.toBe(true);
    expect(body).toHaveBeenCalledTimes(1);
  });

  it("counts a skipped tick in lifecycle_lock_skipped_total", async () => {
    let finish!: () => void;
    const holder = runSingleFlight(LOCK_JOB_NAME, () => new Promise<void>((r) => (finish = r)));
    await flush();

    const before = await skippedCount(LOCK_JOB_NAME);
    await expect(runSingleFlight(LOCK_JOB_NAME, jest.fn())).resolves.toBe(false);
    expect(await skippedCount(LOCK_JOB_NAME)).toBe(before + 1);

    finish();
    await holder;
  });

  it("sets the lock with NX and a PX TTL longer than a normal run", async () => {
    await runSingleFlight(LOCK_JOB_NAME, jest.fn().mockResolvedValue(undefined));

    expect(mockRedis.set).toHaveBeenCalledWith(LOCK_KEY, expect.any(String), "PX", TTL_MS, "NX");
  });

  it("releases the lock after a run so the next tick can run", async () => {
    const body = jest.fn().mockResolvedValue(undefined);

    await expect(runSingleFlight(LOCK_JOB_NAME, body)).resolves.toBe(true);
    await expect(runSingleFlight(LOCK_JOB_NAME, body)).resolves.toBe(true);

    expect(body).toHaveBeenCalledTimes(2);
    expect(mockStore.has(LOCK_KEY)).toBe(false);
  });

  it("never deletes a lock it no longer owns (compare-and-delete)", async () => {
    await runSingleFlight(LOCK_JOB_NAME, async () => {
      // Simulate: our lock expired mid-run and another replica took it.
      mockStore.set(LOCK_KEY, { value: "other-replica", expiresAt: Date.now() + TTL_MS });
    });

    expect(mockStore.get(LOCK_KEY)?.value).toBe("other-replica");
  });

  it("lets another replica take over when the holder crashed (TTL expiry)", async () => {
    // A replica acquired the lock and died without releasing it.
    await mockRedis.set(LOCK_KEY, "dead-replica", "PX", TTL_MS);

    await expect(runSingleFlight(LOCK_JOB_NAME, jest.fn())).resolves.toBe(false);

    jest.setSystemTime(Date.now() + TTL_MS + 1);

    const body = jest.fn().mockResolvedValue(undefined);
    await expect(runSingleFlight(LOCK_JOB_NAME, body)).resolves.toBe(true);
    expect(body).toHaveBeenCalledTimes(1);
  });

  it("renews the lock during a run longer than its TTL, so a rival cannot take it", async () => {
    let finish!: () => void;
    const body = jest.fn(() => new Promise<void>((r) => (finish = r)));
    const run = runSingleFlight(LOCK_JOB_NAME, body);
    await flush();

    const rival = jest.fn().mockResolvedValue(undefined);
    // Run for twice the TTL. At each step the rival must still be locked out.
    for (let elapsed = 0; elapsed < 2 * TTL_MS; elapsed += TTL_MS / 3) {
      await jest.advanceTimersByTimeAsync(TTL_MS / 3);
      await expect(runSingleFlight(LOCK_JOB_NAME, rival)).resolves.toBe(false);
    }

    expect(rival).not.toHaveBeenCalled();
    expect(renewCalls()).toBeGreaterThan(0);

    finish();
    await expect(run).resolves.toBe(true);
    expect(mockStore.has(LOCK_KEY)).toBe(false);
  });

  it("stops renewing once the run has finished", async () => {
    await runSingleFlight(LOCK_JOB_NAME, async () => {
      await jest.advanceTimersByTimeAsync(TTL_MS / 3 + 1);
    });
    const callsAfterRun = renewCalls();

    await jest.advanceTimersByTimeAsync(3 * TTL_MS);
    expect(renewCalls()).toBe(callsAfterRun);
  });

  it("makes a BullMQ tick that finds the lock held a no-op for the markets", async () => {
    let finish!: () => void;
    const holder = runSingleFlight(LOCK_JOB_NAME, () => new Promise<void>((r) => (finish = r)));
    await flush();

    const { db } = jest.requireMock("../../db") as { db: { market: { findMany: jest.Mock } } };
    await processLifecycleJob({ name: LOCK_JOB_NAME } as unknown as Job);
    expect(db.market.findMany).not.toHaveBeenCalled();

    finish();
    await holder;
  });
});
