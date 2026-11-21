/**
 * #1583: rate limiter headers and Redis failure handling.
 *
 * ioredis is replaced by a fake whose pipeline result is set per test, so no
 * Redis is needed. Logger and config are mocked; the metric is read back from
 * the real registry.
 */
import express from "express";
import request from "supertest";
import { rateLimitMiddleware } from "../rateLimit.middleware";
import { config } from "../../../config";
import { logger } from "../../../logger";
import { rateLimitRedisErrorsTotal } from "../../../metrics";

// ── Mocks ─────────────────────────────────────────────────────────────────────
// Factories only reference `mock*` variables inside arrow functions, which run
// after module initialisation, so the hoisted jest.mock calls stay safe.

/** Next pipeline result: either a count/oldest tuple or a thrown error. */
let mockNextPipeline: { count: number; oldestScore: number } | { throws: Error } = {
  count: 1,
  oldestScore: 0,
};

const mockPipeline = {
  zremrangebyscore() {
    return this;
  },
  zadd() {
    return this;
  },
  zcard() {
    return this;
  },
  pexpire() {
    return this;
  },
  zrange() {
    return this;
  },
  async exec() {
    if ("throws" in mockNextPipeline) throw mockNextPipeline.throws;
    const { count, oldestScore } = mockNextPipeline;
    return [
      [null, 0],
      [null, 1],
      [null, count],
      [null, 1],
      [null, ["old-member", String(oldestScore)]],
    ];
  },
};

jest.mock("ioredis", () => ({
  __esModule: true,
  default: class FakeRedis {
    multi() {
      return mockPipeline;
    }
  },
}));

jest.mock("../../../logger", () => ({
  logger: { info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const WINDOW_MS = 60_000;
const NOW = Date.parse("2026-11-19T12:00:00Z");

function buildApp(options: { max: number; failMode?: "open" | "closed" }) {
  const app = express();
  app.get(
    "/limited",
    rateLimitMiddleware({
      windowMs: WINDOW_MS,
      max: options.max,
      keyPrefix: "test",
      keyGenerator: () => "client-1",
      failMode: options.failMode,
    }),
    (_req, res) => {
      res.json({ ok: true });
    },
  );
  return app;
}

async function redisErrorCount(mode: string): Promise<number> {
  const { values } = await rateLimitRedisErrorsTotal.get();
  return values
    .filter((v) => v.labels.fail_mode === mode)
    .reduce((sum, v) => sum + v.value, 0);
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  config.RATE_LIMIT_FAIL_MODE = "open";
  mockNextPipeline = { count: 1, oldestScore: NOW };
});

afterEach(() => {
  jest.useRealTimers();
});

// ── Headers ───────────────────────────────────────────────────────────────────

describe("RateLimit headers (#1583)", () => {
  it("sets Limit, Remaining and Reset on an allowed response", async () => {
    mockNextPipeline = { count: 3, oldestScore: NOW - 20_000 };

    const res = await request(buildApp({ max: 10 })).get("/limited");

    expect(res.status).toBe(200);
    expect(res.headers["ratelimit-limit"]).toBe("10");
    expect(res.headers["ratelimit-remaining"]).toBe("7");
    // The oldest request ages out in 40s (60s window, 20s already elapsed).
    expect(res.headers["ratelimit-reset"]).toBe("40");
  });

  it("sets the same headers on a 429, with Remaining at zero and Retry-After", async () => {
    mockNextPipeline = { count: 11, oldestScore: NOW - 30_000 };

    const res = await request(buildApp({ max: 10 })).get("/limited");

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(res.headers["ratelimit-limit"]).toBe("10");
    expect(res.headers["ratelimit-remaining"]).toBe("0");
    expect(res.headers["ratelimit-reset"]).toBe("30");
    expect(res.headers["retry-after"]).toBe("30");
  });

  it("never reports a negative Remaining or a zero Reset", async () => {
    mockNextPipeline = { count: 50, oldestScore: NOW - WINDOW_MS };

    const res = await request(buildApp({ max: 10 })).get("/limited");

    expect(res.headers["ratelimit-remaining"]).toBe("0");
    expect(Number(res.headers["ratelimit-reset"])).toBeGreaterThanOrEqual(1);
  });
});

// ── Redis failure ─────────────────────────────────────────────────────────────

describe("Redis failure handling (#1583)", () => {
  const outage = { throws: new Error("ECONNREFUSED 127.0.0.1:6379") };

  it("fails open by default: the request goes through, with a warning and a metric", async () => {
    mockNextPipeline = outage;
    const before = await redisErrorCount("open");

    const res = await request(buildApp({ max: 10 })).get("/limited");

    expect(res.status).toBe(200);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ failMode: "open" }),
      expect.stringContaining("rate limiter unavailable"),
    );
    expect(await redisErrorCount("open")).toBe(before + 1);
  });

  it("fails closed when RATE_LIMIT_FAIL_MODE=closed: 503 and the handler never runs", async () => {
    config.RATE_LIMIT_FAIL_MODE = "closed";
    mockNextPipeline = outage;
    const before = await redisErrorCount("closed");

    const res = await request(buildApp({ max: 10 })).get("/limited");

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("RATE_LIMIT_UNAVAILABLE");
    expect(await redisErrorCount("closed")).toBe(before + 1);
  });

  it("a per-limiter closed mode (write routes) wins over an open default", async () => {
    config.RATE_LIMIT_FAIL_MODE = "open";
    mockNextPipeline = outage;

    const res = await request(buildApp({ max: 10, failMode: "closed" })).get("/limited");

    expect(res.status).toBe(503);
  });

  it("a per-limiter open mode lets traffic through even when the env default is closed", async () => {
    config.RATE_LIMIT_FAIL_MODE = "closed";
    mockNextPipeline = outage;

    const res = await request(buildApp({ max: 10, failMode: "open" })).get("/limited");

    expect(res.status).toBe(200);
  });

  it("does not double-call the handler when the handler itself succeeds", async () => {
    mockNextPipeline = { count: 1, oldestScore: NOW };
    const app = express();
    const handler = jest.fn((_req: express.Request, res: express.Response) => res.json({ ok: true }));
    app.get(
      "/once",
      rateLimitMiddleware({ windowMs: WINDOW_MS, max: 10, keyPrefix: "test", keyGenerator: () => "c" }),
      handler,
    );

    await request(app).get("/once");

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
