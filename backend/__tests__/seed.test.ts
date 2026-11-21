/**
 * B-139: prisma/seed.ts
 *
 * Checks the plan's coverage (every status, both bet sides, a claimed
 * payout, a dispute), its determinism, the production guard, and that
 * applying it twice leaves the database unchanged. The database is an
 * in-memory fake that implements upsert/update by unique key.
 */
import {
  applySeedPlan,
  assertSeedAllowed,
  buildSeedPlan,
} from "../prisma/seed";

// ─── Plan contents ───────────────────────────────────────────────────────────

describe("B-139 — seed plan", () => {
  const plan = buildSeedPlan();

  test("has one market in each status", () => {
    const statuses = new Set(plan.markets.map((m) => m.status));
    expect(statuses).toEqual(new Set(["Open", "Locked", "Resolved", "Cancelled", "Disputed"]));
  });

  test("bets exist on both sides of at least one market", () => {
    const sides = new Set(plan.bets.map((b) => b.side));
    expect(sides).toEqual(new Set(["FighterA", "FighterB"]));
  });

  test("the resolved market has claimed bets with payouts and a confirmed oracle result", () => {
    const resolved = plan.markets.find((m) => m.status === "Resolved");
    expect(resolved).toBeDefined();
    const claimed = plan.bets.filter((b) => b.marketId === resolved!.id && b.claimed);
    expect(claimed.length).toBeGreaterThan(0);
    expect(claimed.every((b) => b.payout !== null && b.payout > 0n)).toBe(true);
    expect(plan.oracleResults.find((r) => r.marketId === resolved!.id)).toMatchObject({
      outcome: "FighterA",
      confirmed: true,
    });
  });

  test("the disputed market has an open dispute", () => {
    const disputed = plan.markets.find((m) => m.status === "Disputed");
    expect(plan.disputes.filter((d) => d.marketId === disputed!.id)).toHaveLength(1);
  });

  test("ids are unique within each collection", () => {
    const unique = (xs: string[]) => new Set(xs).size === xs.length;
    expect(unique(plan.categories.map((c) => c.id))).toBe(true);
    expect(unique(plan.markets.map((m) => m.id))).toBe(true);
    expect(unique(plan.bets.map((b) => b.id))).toBe(true);
    expect(unique(plan.disputes.map((d) => d.id))).toBe(true);
  });

  test("every bet references a market in the plan and every market a category", () => {
    const marketIds = new Set(plan.markets.map((m) => m.id));
    const categoryIds = new Set(plan.categories.map((c) => c.id));
    expect(plan.bets.every((b) => marketIds.has(b.marketId))).toBe(true);
    expect(plan.markets.every((m) => categoryIds.has(m.categoryId))).toBe(true);
  });

  test("is deterministic", () => {
    expect(buildSeedPlan()).toEqual(buildSeedPlan());
  });
});

// ─── Production guard ────────────────────────────────────────────────────────

describe("B-139 — production guard", () => {
  test("refuses when NODE_ENV=production", () => {
    expect(() => assertSeedAllowed({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toThrow(
      /Refusing to seed/,
    );
  });

  test.each([["development"], ["test"]])("allows NODE_ENV=%s", (env) => {
    expect(() => assertSeedAllowed({ NODE_ENV: env } as NodeJS.ProcessEnv)).not.toThrow();
  });

  test("allows when NODE_ENV is unset", () => {
    expect(() => assertSeedAllowed({} as NodeJS.ProcessEnv)).not.toThrow();
  });
});

// ─── Idempotency ─────────────────────────────────────────────────────────────

/** Minimal in-memory model: upsert/update keyed on a single unique field. */
function fakeDb() {
  const stores: Record<string, Map<string, Record<string, unknown>>> = {};
  const keyOf = (where: Record<string, unknown>) => {
    const [k, v] = Object.entries(where)[0];
    return `${k}:${String(v)}`;
  };
  const model = (name: string) => {
    stores[name] ??= new Map();
    const store = stores[name];
    return {
      upsert: async ({ where, create, update }: any) => {
        const key = keyOf(where);
        const existing = store.get(key);
        store.set(key, existing ? { ...existing, ...update } : { ...create });
        return store.get(key);
      },
      update: async ({ where, data }: any) => {
        const key = keyOf(where);
        const existing = store.get(key);
        if (!existing) throw new Error(`${name} ${key} not found`);
        store.set(key, { ...existing, ...data });
        return store.get(key);
      },
    };
  };
  const db = {
    category: model("category"),
    oracle: model("oracle"),
    market: model("market"),
    bet: model("bet"),
    oracleResult: model("oracleResult"),
    dispute: model("dispute"),
  };
  const snapshot = () =>
    JSON.stringify(
      Object.entries(stores)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, m]) => [name, [...m.entries()].sort(([a], [b]) => a.localeCompare(b))]),
      (_k, v) => (typeof v === "bigint" ? `${v}n` : v),
    );
  const count = (name: string) => stores[name]?.size ?? 0;
  const read = (name: string, id: string) => stores[name]?.get(`id:${id}`);
  return { db: db as any, snapshot, count, read };
}

describe("B-139 — idempotent apply", () => {
  test("running the seed twice leaves the database unchanged", async () => {
    const plan = buildSeedPlan();
    const fake = fakeDb();

    await applySeedPlan(fake.db, plan);
    const afterFirst = fake.snapshot();
    await applySeedPlan(fake.db, plan);

    expect(fake.snapshot()).toBe(afterFirst);
  });

  test("writes exactly the planned number of rows", async () => {
    const plan = buildSeedPlan();
    const fake = fakeDb();

    await applySeedPlan(fake.db, plan);

    expect(fake.count("category")).toBe(plan.categories.length);
    expect(fake.count("oracle")).toBe(plan.oracles.length);
    expect(fake.count("market")).toBe(plan.markets.length);
    expect(fake.count("bet")).toBe(plan.bets.length);
    expect(fake.count("oracleResult")).toBe(plan.oracleResults.length);
    expect(fake.count("dispute")).toBe(plan.disputes.length);
  });

  test("stored pool totals on each market equal the sum of its bets", async () => {
    const plan = buildSeedPlan();
    const fake = fakeDb();
    await applySeedPlan(fake.db, plan);

    for (const m of plan.markets) {
      const marketBets = plan.bets.filter((b) => b.marketId === m.id);
      const poolA = marketBets.filter((b) => b.side === "FighterA").reduce((s, b) => s + b.amount, 0n);
      const poolB = marketBets.filter((b) => b.side === "FighterB").reduce((s, b) => s + b.amount, 0n);
      const stored = fake.read("market", m.id) as Record<string, bigint>;
      expect(stored.poolA).toBe(poolA);
      expect(stored.poolB).toBe(poolB);
      expect(stored.totalPool).toBe(poolA + poolB);
    }
  });
});
