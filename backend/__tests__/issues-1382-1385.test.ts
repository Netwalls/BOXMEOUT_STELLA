/**
 * Tests for issues #1382, #1383, #1384, #1385.
 *
 * Routers and middleware are mounted on minimal Express apps so these suites
 * do not load the whole app (app.ts pulls in modules that still fail to compile
 * on main). Service and controller modules are mocked.
 */

import express from "express";
import request from "supertest";
import * as betService from "../src/services/bet.service";
import leaderboardRoutes from "../src/api/routes/leaderboard.routes";
import oracleRoutes from "../src/api/routes/oracle.routes";
import { securityHeadersMiddleware } from "../src/api/middleware/securityHeaders.middleware";

jest.mock("../src/services/bet.service", () => ({
  getLeaderboard: jest.fn(),
}));

jest.mock("../src/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock("../src/api/controllers/oracle.controller", () => ({
  submitOracleResultHandler: (_req: unknown, res: express.Response) =>
    res.status(200).json({ route: "submit" }),
  listOracleResultsHandler: (_req: unknown, res: express.Response) =>
    res.status(200).json({ route: "results" }),
}));

jest.mock("../src/api/middleware/oracleAuth", () => ({
  oracleAuth: (_req: unknown, _res: unknown, next: express.NextFunction) => next(),
}));

jest.mock("../src/api/middleware/adminAuth", () => ({
  adminAuth: (_req: unknown, _res: unknown, next: express.NextFunction) => next(),
}));

const mockedGetLeaderboard = betService.getLeaderboard as jest.MockedFunction<
  typeof betService.getLeaderboard
>;

// ─── #1382: /api/leaderboard ─────────────────────────────────────────────────

describe("#1382 — GET /api/leaderboard", () => {
  const app = express();
  // Same BigInt serialisation as app.ts; leaderboard profits are bigint.
  app.set("json replacer", (_key: string, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value
  );
  app.use("/api/leaderboard", leaderboardRoutes);

  const entries = [
    {
      rank: 1,
      bettor: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
      realisedProfit: BigInt(500),
      totalStaked: BigInt(1000),
      totalPayout: BigInt(1500),
      settledBets: 4,
      wonBets: 3,
      winRate: 0.75,
    },
  ];

  beforeEach(() => {
    mockedGetLeaderboard.mockResolvedValue({
      period: "all",
      limit: 50,
      generatedAt: new Date(),
      entries,
    });
  });

  it.each(["7d", "30d", "all"] as const)("returns ranked entries for period=%s", async (period) => {
    const res = await request(app).get("/api/leaderboard").query({ period });

    expect(res.status).toBe(200);
    expect(mockedGetLeaderboard).toHaveBeenCalledWith(period, undefined);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ rank: 1, settledBets: 4, wonBets: 3 });
  });

  it("defaults to period=all when the query is omitted", async () => {
    const res = await request(app).get("/api/leaderboard");

    expect(res.status).toBe(200);
    expect(mockedGetLeaderboard).toHaveBeenCalledWith("all", undefined);
  });

  it("forwards a valid limit to the service", async () => {
    const res = await request(app).get("/api/leaderboard").query({ period: "7d", limit: "10" });

    expect(res.status).toBe(200);
    expect(mockedGetLeaderboard).toHaveBeenCalledWith("7d", 10);
  });

  it("rejects an unknown period with 400 and does not query the service", async () => {
    const res = await request(app).get("/api/leaderboard").query({ period: "1y" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(mockedGetLeaderboard).not.toHaveBeenCalled();
  });

  it("returns 500 when the service throws", async () => {
    mockedGetLeaderboard.mockRejectedValueOnce(new Error("db down"));

    const res = await request(app).get("/api/leaderboard").query({ period: "30d" });

    expect(res.status).toBe(500);
  });
});

// ─── #1383: TRUST_PROXY ──────────────────────────────────────────────────────

describe("#1383 — trust proxy reads TRUST_PROXY", () => {
  const originalTrustProxy = process.env.TRUST_PROXY;

  afterEach(() => {
    if (originalTrustProxy === undefined) {
      delete process.env.TRUST_PROXY;
    } else {
      process.env.TRUST_PROXY = originalTrustProxy;
    }
  });

  it("parses TRUST_PROXY=1 into config.TRUST_PROXY", () => {
    process.env.TRUST_PROXY = "1";

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { config } = require("../src/config");
      expect(config.TRUST_PROXY).toBe(1);
    });
  });

  it("uses the X-Forwarded-For client address for req.ip", async () => {
    process.env.TRUST_PROXY = "1";

    let app!: express.Application;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { config } = require("../src/config");
      app = express();
      app.set("trust proxy", config.TRUST_PROXY);
      app.get("/ip", (req, res) => {
        res.json({ ip: req.ip });
      });
    });

    const res = await request(app).get("/ip").set("X-Forwarded-For", "203.0.113.7");

    expect(res.body.ip).toBe("203.0.113.7");
  });
});

// ─── #1384: helmet security headers ──────────────────────────────────────────

describe("#1384 — security headers", () => {
  const app = express();
  app.use(securityHeadersMiddleware);
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/docs", (_req, res) => {
    res.send("swagger");
  });

  it("sets HSTS, nosniff and frame headers on /health", async () => {
    const res = await request(app).get("/health");

    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
  });

  it("sets a Content-Security-Policy on /health", async () => {
    const res = await request(app).get("/health");

    expect(res.headers["content-security-policy"]).toBeDefined();
  });

  it("omits the Content-Security-Policy on /docs so Swagger UI can run", async () => {
    const res = await request(app).get("/docs");

    expect(res.headers["content-security-policy"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});

// ─── #1385: unauthenticated oracle CRUD removed ──────────────────────────────

describe("#1385 — /api/oracle keeps only submit and results", () => {
  const app = express();
  app.use(express.json());
  app.use("/api/oracle", oracleRoutes);

  it("keeps POST /api/oracle/submit", async () => {
    const res = await request(app).post("/api/oracle/submit").send({});
    expect(res.status).toBe(200);
  });

  it("keeps GET /api/oracle/results", async () => {
    const res = await request(app).get("/api/oracle/results");
    expect(res.status).toBe(200);
  });

  it.each([
    ["GET", "/api/oracle"],
    ["POST", "/api/oracle"],
    ["PUT", "/api/oracle/1"],
    ["DELETE", "/api/oracle/1"],
  ])("returns 404 for %s %s", async (method, path) => {
    const res = await request(app)[method.toLowerCase() as "get"](path);
    expect(res.status).toBe(404);
  });
});
