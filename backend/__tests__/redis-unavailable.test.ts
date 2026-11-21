/**
 * #1590: behaviour when Redis is unavailable.
 *
 * Every ioredis client in the process is replaced with a fake whose commands
 * either reject immediately (ECONNREFUSED, "error" mode) or never settle
 * (what `maxRetriesPerRequest: null` does during an outage, "hang" mode). Each
 * feature is then asserted against the policy in docs/redis-failure-modes.md.
 */

import express from "express";
import request from "supertest";
import type { Request, Response, NextFunction } from "express";
import { redisErrorsTotal } from "../src/metrics";

let mockRedisMode: "error" | "hang" = "error";

jest.mock("ioredis", () => {
  const unavailable = (): Promise<never> =>
    mockRedisMode === "hang"
      ? new Promise<never>(() => undefined)
      : Promise.reject(new Error("connect ECONNREFUSED 127.0.0.1:6379"));

  // Synchronous client methods must not return rejected promises, otherwise
  // the outage itself would produce unhandled rejections.
  const synchronous = new Set(["on", "once", "off", "removeListener", "disconnect"]);

  function fakeMulti(): unknown {
    const chain: unknown = new Proxy(
      {},
      {
        get: (_target, prop) => (prop === "exec" ? () => unavailable() : () => chain),
      }
    );
    return chain;
  }

  class FakeRedis {
    constructor() {
      return new Proxy(this, {
        get(target, prop) {
          if (prop in target) return Reflect.get(target, prop);
          if (prop === "then") return undefined;
          if (prop === "multi") return () => fakeMulti();
          if (typeof prop === "string" && synchronous.has(prop)) return () => undefined;
          return () => unavailable();
        },
      });
    }
  }

  return { __esModule: true, default: FakeRedis };
});

// Keep logs quiet; the assertions are on responses and metrics.
jest.mock("../src/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  sanitizeErrorForLog: (err: unknown) => err,
}));

async function redisErrorCount(feature: string): Promise<number> {
  const data = await redisErrorsTotal.get();
  const row = data.values.find((v) => v.labels.feature === feature);
  return row?.value ?? 0;
}

// ─── Primitives ──────────────────────────────────────────────────────────────

describe("#1590 guardRedis / requireRedis", () => {
  // Imported lazily so the mocked ioredis is in place first.
  const load = () => require("../src/lib/redis-guard") as typeof import("../src/lib/redis-guard");

  it("guardRedis returns the fallback when the command rejects, and counts it", async () => {
    mockRedisMode = "error";
    const { guardRedis } = load();
    const before = await redisErrorCount("test_primitives");

    const value = await guardRedis("test_primitives", () => Promise.reject(new Error("boom")), "fallback");

    expect(value).toBe("fallback");
    expect(await redisErrorCount("test_primitives")).toBe(before + 1);
  });

  it("guardRedis stops waiting on a hung command at the deadline", async () => {
    mockRedisMode = "hang";
    const { guardRedis } = load();
    const started = Date.now();

    const value = await guardRedis("test_timeout", () => new Promise<string>(() => undefined), "fallback", 50);

    expect(value).toBe("fallback");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("requireRedis throws a 503 RedisUnavailableError instead of hanging", async () => {
    mockRedisMode = "hang";
    const { requireRedis, RedisUnavailableError } = load();

    await expect(
      requireRedis("test_required", () => new Promise<string>(() => undefined), 50)
    ).rejects.toMatchObject({ statusCode: 503, code: "SERVICE_UNAVAILABLE" });
    await expect(
      requireRedis("test_required", () => new Promise<string>(() => undefined), 50)
    ).rejects.toBeInstanceOf(RedisUnavailableError);
  });

  it("a late rejection after the deadline does not become an unhandled rejection", async () => {
    const { guardRedis } = load();
    const onUnhandled = jest.fn();
    process.on("unhandledRejection", onUnhandled);
    try {
      let rejectLate!: (err: Error) => void;
      const late = new Promise<string>((_, reject) => {
        rejectLate = reject;
      });
      await guardRedis("test_late", () => late, "fallback", 10);
      rejectLate(new Error("arrives after the deadline"));
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(onUnhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});

// ─── Rate limiter: fail open ─────────────────────────────────────────────────

describe("#1590 rate limiter fails open", () => {
  const { rateLimitMiddleware } = require("../src/api/middleware/rateLimit.middleware") as typeof import("../src/api/middleware/rateLimit.middleware");

  function app() {
    const a = express();
    a.get(
      "/limited",
      rateLimitMiddleware({ windowMs: 60_000, max: 1, keyPrefix: "test-1590" }),
      (_req, res) => {
        res.status(200).json({ ok: true });
      }
    );
    return a;
  }

  it.each(["error", "hang"] as const)("lets requests through when Redis is %s", async (mode) => {
    mockRedisMode = mode;
    const before = await redisErrorCount("rate_limit");

    const res = await request(app()).get("/limited");

    expect(res.status).toBe(200);
    expect(await redisErrorCount("rate_limit")).toBeGreaterThan(before);
  });
});

// ─── Wallet challenges: fail closed with 503 ─────────────────────────────────

describe("#1590 wallet auth fails closed with 503", () => {
  // walletAuth picks the in-memory store under NODE_ENV=test. Load it with
  // another NODE_ENV so the Redis path is exercised.
  function loadWalletAuth() {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      let mod!: typeof import("../src/api/middleware/walletAuth.middleware");
      let controller!: typeof import("../src/api/controllers/auth.controller");
      jest.isolateModules(() => {
        mod = require("../src/api/middleware/walletAuth.middleware");
        controller = require("../src/api/controllers/auth.controller");
      });
      return { mod, controller };
    } finally {
      process.env.NODE_ENV = previous;
    }
  }

  const address = "G" + "A".repeat(55);

  it.each(["error", "hang"] as const)("GET /challenge returns 503 when Redis is %s", async (mode) => {
    mockRedisMode = mode;
    const { controller } = loadWalletAuth();
    const a = express();
    a.get("/api/auth/challenge", controller.getChallengeHandler);

    const res = await request(a).get("/api/auth/challenge").query({ address });

    expect(res.status).toBe(503);
    expect(res.body.code ?? res.body.error?.code).toBe("SERVICE_UNAVAILABLE");
  });

  it.each(["error", "hang"] as const)("signed requests are refused with 503 when Redis is %s", async (mode) => {
    mockRedisMode = mode;
    const { mod } = loadWalletAuth();
    const a = express();
    a.get("/protected", mod.walletAuthMiddleware({ whitelist: [] }), (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const res = await request(a)
      .get("/protected")
      .set("x-wallet-address", address)
      .set("x-wallet-signature", Buffer.from("sig").toString("base64"));

    expect(res.status).toBe(503);
    expect(res.status).not.toBe(401);
  });
});

// ─── Idempotency: fail open ──────────────────────────────────────────────────

describe("#1590 idempotency fails open", () => {
  const { idempotencyMiddleware } = require("../src/api/middleware/idempotency.middleware") as typeof import("../src/api/middleware/idempotency.middleware");

  function appWith(store: Parameters<typeof idempotencyMiddleware>[0]) {
    const a = express();
    a.use(express.json());
    a.post(
      "/orders",
      idempotencyMiddleware(store),
      (_req: Request, res: Response, _next: NextFunction) => {
        res.status(201).json({ created: true });
      }
    );
    return a;
  }

  it.each(["error", "hang"] as const)("runs the handler without idempotency when the store is %s", async (mode) => {
    const failing = () => (mode === "hang" ? new Promise<never>(() => undefined) : Promise.reject(new Error("down")));
    const store = { get: failing, set: failing, del: failing } as unknown as Parameters<typeof idempotencyMiddleware>[0];

    const res = await request(appWith(store))
      .post("/orders")
      .set("Idempotency-Key", "key-1590")
      .send({ amount: 1 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ created: true });
  });
});

// ─── Market search cache: falls back to Postgres ─────────────────────────────

describe("#1590 market search cache falls back to the database", () => {
  const dbRows = [{ id: "m-1", question: "Who wins?" }];

  beforeEach(() => {
    jest.resetModules();
  });

  it.each(["error", "hang"] as const)("returns database results when Redis is %s", async (mode) => {
    mockRedisMode = mode;
    jest.doMock("../src/db", () => ({
      db: {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce(dbRows)
          .mockResolvedValueOnce([{ count: BigInt(1) }]),
      },
    }));
    const { searchMarkets } = require("../src/repositories/market.repository") as typeof import("../src/repositories/market.repository");

    const result = await searchMarkets("who", 1, 20);

    expect(result.total).toBe(1);
    expect(result.data).toEqual(dbRows);
  });
});

// ─── SSE fan-out: a Redis outage must not crash the process ──────────────────

describe("#1590 SSE cross-instance fan-out is best-effort", () => {
  it.each(["reject", "hang"] as const)("local subscribers still get events when publish %s", async (mode) => {
    const events = require("../src/events/marketEvents") as typeof import("../src/events/marketEvents");
    const publisher = {
      publish: () =>
        mode === "reject" ? Promise.reject(new Error("ECONNREFUSED")) : new Promise<unknown>(() => undefined),
    };
    const subscriber = {
      subscribe: () => Promise.resolve(),
      unsubscribe: () => Promise.resolve(),
      on: () => undefined,
      off: () => undefined,
    };
    events.configureMarketEventRedis({ publisher, subscriber });

    const received = jest.fn();
    const unsubscribe = events.subscribeToMarketDistributed("m-sse", received);
    const onUnhandled = jest.fn();
    process.on("unhandledRejection", onUnhandled);
    try {
      events.publishMarketEventDistributed("m-sse", "BetPlaced" as never, { amount: 1 });
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(received).toHaveBeenCalledTimes(1);
      expect(onUnhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", onUnhandled);
      unsubscribe();
      events.configureMarketEventRedis(null);
    }
  });
});
