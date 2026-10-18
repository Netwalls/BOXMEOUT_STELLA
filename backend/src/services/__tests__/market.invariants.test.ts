import express from "express";
import request from "supertest";
import { db } from "../../db";
import { redis } from "../../lib/redis";
import { errorHandlerMiddleware } from "../../api/middleware/errorHandler.middleware";
import { requestIdMiddleware } from "../../api/middleware/requestId.middleware";
import { toConflictError } from "../../errors";

// #1395 B-97: the database rejects violating pool and dispute rows, and the API
// reports them as 409. Each run uses its own id prefix.
const runId = Date.now().toString(36);
const idPrefix = `inv-${runId}-`;

function marketData(suffix: string, pools: { poolA?: bigint; poolB?: bigint; totalPool?: bigint }) {
  return {
    id: `${idPrefix}${suffix}`,
    contractAddress: `CINV${runId.toUpperCase()}${suffix.toUpperCase()}`,
    fighterA: {},
    fighterB: {},
    scheduledAt: new Date("2030-01-01T00:00:00Z"),
    bettingEndsAt: new Date("2030-01-01T00:00:00Z"),
    createdAt: new Date("2029-01-01T00:00:00Z"),
    createdBy: "GCREATORINVARIANTTEST",
    oracleAddress: "GORACLEINVARIANTTEST",
    ...pools,
  };
}

function appThatCreates(action: () => Promise<unknown>): express.Application {
  const app = express();
  app.use(requestIdMiddleware);
  app.post("/write", async (_req, res, next) => {
    try {
      await action();
      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });
  app.use(errorHandlerMiddleware);
  return app;
}

/** SQLSTATE of a rejected query, from Prisma's meta (raw path) or its message (ORM path). */
async function sqlStateOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (err) {
    const meta = (err as { meta?: { code?: string } }).meta?.code;
    return meta ?? /code: "(\w{5})"/.exec(String((err as Error).message))?.[1];
  }
  return undefined;
}

beforeAll(async () => {
  await db.market.create({ data: marketData("base", { poolA: 10n, poolB: 5n, totalPool: 15n }) });
});

afterAll(async () => {
  await db.dispute.deleteMany({ where: { marketId: { startsWith: idPrefix } } });
  await db.market.deleteMany({ where: { id: { startsWith: idPrefix } } });
  await db.$disconnect();
  await redis.quit();
});

describe("market pool CHECK constraints (#1395)", () => {
  it.each([
    ["poolA", { poolA: -1n, totalPool: -1n }],
    ["poolB", { poolB: -1n, totalPool: -1n }],
    ["totalPool", { totalPool: -1n }],
  ])("rejects a negative %s", async (_name, pools) => {
    const sqlState = await sqlStateOf(
      db.market.create({ data: marketData(`neg-${_name}`, pools) }),
    );

    expect(sqlState).toBe("23514");
  });

  it("rejects a totalPool that differs from poolA + poolB", async () => {
    const sqlState = await sqlStateOf(
      db.market.create({ data: marketData("mismatch", { poolA: 1n, poolB: 1n, totalPool: 3n }) }),
    );

    expect(sqlState).toBe("23514");
  });

  it("rejects an UPDATE that breaks the invariant", async () => {
    const sqlState = await sqlStateOf(
      db.$executeRaw`UPDATE "Market" SET "totalPool" = 99 WHERE "id" = ${`${idPrefix}base`}`,
    );

    expect(sqlState).toBe("23514");
  });

  it("accepts a consistent row", async () => {
    await expect(
      db.market.create({ data: marketData("ok", { poolA: 4n, poolB: 6n, totalPool: 10n }) }),
    ).resolves.toBeDefined();
  });

  it("maps the violation to a 409 response", async () => {
    const app = appThatCreates(() =>
      db.market.create({ data: marketData("api-neg", { poolA: -1n, totalPool: -1n }) }),
    );

    const res = await request(app).post("/write").set("X-Request-Id", "req-1395").expect(409);

    expect(res.body).toEqual({
      error: "Request violates a data integrity rule",
      code: "CONFLICT",
      requestId: "req-1395",
    });
  });
});

describe("one open dispute per market (#1395)", () => {
  beforeAll(async () => {
    await db.dispute.create({
      data: { id: `${idPrefix}dispute-open`, marketId: `${idPrefix}base`, raisedBy: "GRAISER", reason: "first" },
    });
  });

  it("rejects a second unresolved dispute on the same market", async () => {
    const error = await db.dispute
      .create({
        data: { id: `${idPrefix}dispute-second`, marketId: `${idPrefix}base`, raisedBy: "GRAISER", reason: "second" },
      })
      .catch((err: unknown) => err);

    expect(toConflictError(error)).not.toBeNull();
  });

  it("allows a new dispute once the open one is resolved", async () => {
    await db.dispute.update({
      where: { id: `${idPrefix}dispute-open` },
      data: { resolvedAt: new Date(), resolution: "FighterA" },
    });

    await expect(
      db.dispute.create({
        data: { id: `${idPrefix}dispute-after`, marketId: `${idPrefix}base`, raisedBy: "GRAISER", reason: "third" },
      }),
    ).resolves.toBeDefined();
  });

  it("maps the duplicate open dispute to a 409 response", async () => {
    const app = appThatCreates(() =>
      db.dispute.create({
        data: { id: `${idPrefix}dispute-api`, marketId: `${idPrefix}base`, raisedBy: "GRAISER", reason: "api" },
      }),
    );

    await request(app).post("/write").expect(409);
  });
});

describe("toConflictError", () => {
  it("returns null for errors that are not integrity violations", () => {
    expect(toConflictError(new Error("boom"))).toBeNull();
  });
});
