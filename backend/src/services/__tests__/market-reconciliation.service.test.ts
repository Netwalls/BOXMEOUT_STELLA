/**
 * B-114 / #1412 — matching rules, drift detection, repair and sweep
 * behaviour for the database ↔ on-chain reconciler.
 *
 * Store and chain access are injected fakes, so no database or RPC is used.
 */

jest.mock("../../logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  createReconciler,
  detectDrift,
  DbMarket,
  OnChainMarket,
  parseOnChainMarket,
  ReconcilerDeps,
} from "../market-reconciliation.service";

const dbMarket = (overrides: Partial<DbMarket> = {}): DbMarket => ({
  id: "m1",
  contractAddress: "CONTRACT_M1",
  status: "Open",
  outcome: null,
  poolA: BigInt(100),
  poolB: BigInt(50),
  totalPool: BigInt(150),
  scheduledAt: new Date("2026-10-18T00:00:00Z"),
  ...overrides,
});

const chainMarket = (overrides: Partial<OnChainMarket> = {}): OnChainMarket => ({
  status: "Open",
  outcome: null,
  poolA: BigInt(100),
  poolB: BigInt(50),
  totalPool: BigInt(150),
  ...overrides,
});

function makeDeps(overrides: Partial<ReconcilerDeps> = {}) {
  const deps: ReconcilerDeps = {
    loadMarket: jest.fn().mockResolvedValue(dbMarket()),
    sampleMarkets: jest.fn().mockResolvedValue([]),
    repairMarket: jest.fn().mockResolvedValue(undefined),
    readOnChain: jest.fn().mockResolvedValue(chainMarket()),
    ...overrides,
  };
  return { deps, reconciler: createReconciler(deps) };
}

describe("parseOnChainMarket", () => {
  it("reads Soroban enum variants in vector, object and string form", () => {
    const parsed = parseOnChainMarket({
      status: ["Locked"],
      outcome: { name: "FighterA" },
      pool_a: BigInt(10),
      pool_b: "20",
      total_pool: 30,
    });

    expect(parsed).toEqual({
      status: "Locked",
      outcome: "FighterA",
      poolA: BigInt(10),
      poolB: BigInt(20),
      totalPool: BigInt(30),
    });
  });

  it("maps an Undetermined outcome to null", () => {
    const parsed = parseOnChainMarket({
      status: { tag: "Open" },
      outcome: ["Undetermined"],
      pool_a: 0,
      pool_b: 0,
      total_pool: 0,
    });
    expect(parsed.outcome).toBeNull();
  });

  it("rejects an unknown status", () => {
    expect(() =>
      parseOnChainMarket({ status: "Paused", outcome: null, pool_a: 0, pool_b: 0, total_pool: 0 }),
    ).toThrow(/Unknown on-chain market status/);
  });

  it("rejects a pool value that is not an integer", () => {
    expect(() =>
      parseOnChainMarket({ status: "Open", outcome: null, pool_a: "1.5", pool_b: 0, total_pool: 0 }),
    ).toThrow(/pool_a/);
  });
});

describe("detectDrift", () => {
  it("returns no entries when database and chain agree", () => {
    expect(detectDrift(dbMarket(), chainMarket())).toEqual([]);
  });

  it("treats null and null outcomes as equal", () => {
    expect(detectDrift(dbMarket({ outcome: null }), chainMarket({ outcome: null }))).toEqual([]);
  });

  it("reports status, outcome and pool drift with both values", () => {
    const drift = detectDrift(
      dbMarket({ status: "Open", outcome: null, poolA: BigInt(100) }),
      chainMarket({ status: "Resolved", outcome: "Draw", poolA: BigInt(120) }),
    );

    expect(drift).toEqual([
      { field: "status", db: "Open", chain: "Resolved" },
      { field: "outcome", db: null, chain: "Draw" },
      { field: "poolA", db: "100", chain: "120" },
    ]);
  });

  it("detects a pool mismatch even when the status matches", () => {
    const drift = detectDrift(dbMarket({ poolB: BigInt(50) }), chainMarket({ poolB: BigInt(55) }));
    expect(drift.map((d) => d.field)).toEqual(["poolB"]);
  });
});

describe("reconcileMarket", () => {
  it("reports drift without writing when autoRepair is off", async () => {
    const { deps, reconciler } = makeDeps({
      readOnChain: jest.fn().mockResolvedValue(chainMarket({ status: "Locked" })),
    });

    const report = await reconciler.reconcileMarket("m1");

    expect(report.repaired).toBe(false);
    expect(report.drift).toEqual([{ field: "status", db: "Open", chain: "Locked" }]);
    expect(deps.repairMarket).not.toHaveBeenCalled();
  });

  it("repairs only the drifted fields when autoRepair is on", async () => {
    const { deps, reconciler } = makeDeps({
      readOnChain: jest
        .fn()
        .mockResolvedValue(chainMarket({ status: "Resolved", outcome: "FighterB", totalPool: BigInt(999) })),
    });

    const report = await reconciler.reconcileMarket("m1", { autoRepair: true });

    expect(report.repaired).toBe(true);
    expect(deps.repairMarket).toHaveBeenCalledWith("m1", {
      status: "Resolved",
      outcome: "FighterB",
      totalPool: BigInt(999),
    });
  });

  it("does nothing when there is no drift", async () => {
    const { deps, reconciler } = makeDeps();

    const report = await reconciler.reconcileMarket("m1", { autoRepair: true });

    expect(report).toEqual({ marketId: "m1", drift: [], repaired: false });
    expect(deps.repairMarket).not.toHaveBeenCalled();
  });

  it("reads on-chain state from the market's own contract address", async () => {
    const { deps, reconciler } = makeDeps();
    await reconciler.reconcileMarket("m1");
    expect(deps.readOnChain).toHaveBeenCalledWith("CONTRACT_M1");
  });

  it("throws NOT_FOUND for an unknown market", async () => {
    const { reconciler } = makeDeps({ loadMarket: jest.fn().mockResolvedValue(null) });

    await expect(reconciler.reconcileMarket("missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("runSweep", () => {
  it("samples recent and open markets within the lookback window", async () => {
    const { deps, reconciler } = makeDeps();
    const now = new Date("2026-10-19T00:00:00Z");

    await reconciler.runSweep({ sampleSize: 10, lookbackDays: 7, now });

    expect(deps.sampleMarkets).toHaveBeenCalledWith({
      since: new Date("2026-10-12T00:00:00Z"),
      take: 10,
    });
  });

  it("counts checked and drifted markets and keeps only drifted reports", async () => {
    const markets = [dbMarket({ id: "a" }), dbMarket({ id: "b" }), dbMarket({ id: "c" })];
    const readOnChain = jest.fn(async (contractAddress: string) =>
      contractAddress === "CONTRACT_b" ? chainMarket({ status: "Cancelled" }) : chainMarket(),
    );
    const { reconciler } = makeDeps({
      sampleMarkets: jest.fn().mockResolvedValue(
        markets.map((m) => ({ ...m, contractAddress: `CONTRACT_${m.id}` })),
      ),
      readOnChain,
      loadMarket: jest.fn(async (id: string) => ({ ...dbMarket({ id }), contractAddress: `CONTRACT_${id}` })),
    });

    const sweep = await reconciler.runSweep();

    expect(sweep.checked).toBe(3);
    expect(sweep.drifted).toBe(1);
    expect(sweep.failed).toBe(0);
    expect(sweep.reports.map((r) => r.marketId)).toEqual(["b"]);
  });

  it("keeps going when one market's RPC call fails", async () => {
    const readOnChain = jest
      .fn()
      .mockRejectedValueOnce(new Error("RPC timeout"))
      .mockResolvedValueOnce(chainMarket({ status: "Locked" }));
    const { deps, reconciler } = makeDeps({
      sampleMarkets: jest.fn().mockResolvedValue([dbMarket({ id: "bad" }), dbMarket({ id: "good" })]),
      loadMarket: jest.fn(async (id: string) => dbMarket({ id })),
      readOnChain,
    });

    const sweep = await reconciler.runSweep({ autoRepair: true });

    expect(sweep.failed).toBe(1);
    expect(sweep.checked).toBe(1);
    expect(sweep.drifted).toBe(1);
    expect(deps.repairMarket).toHaveBeenCalledTimes(1);
    expect(deps.repairMarket).toHaveBeenCalledWith("good", { status: "Locked" });
  });
});
