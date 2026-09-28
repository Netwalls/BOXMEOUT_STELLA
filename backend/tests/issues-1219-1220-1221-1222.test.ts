/**
 * Integration tests for issues #1219, #1220, #1221, #1222.
 *
 * These tests use supertest against the real Express app (no DB) so they stay
 * fast and require no external services.  Service/DB calls that would fail in
 * the test environment are mocked at the module level.
 */

import request from "supertest";
import { createApp } from "../../src/app";

// ─── Shared mocks ────────────────────────────────────────────────────────────

// Prevent real DB / Stellar calls from firing during route-level tests.
jest.mock("../../src/services/oracle.service", () => ({
  submitFightResult: jest.fn().mockResolvedValue({ id: 1, market_id: "m1", outcome: "fighter_a" }),
  getAllOracles: jest.fn().mockResolvedValue([]),
  createOracle: jest.fn().mockResolvedValue({ id: "o1", address: "G".repeat(56), name: "Test" }),
  updateOracle: jest.fn().mockResolvedValue({ id: "o1", address: "G".repeat(56), name: "Updated" }),
  deleteOracle: jest.fn().mockResolvedValue({ id: "o1", active: false }),
  confirmFightResult: jest.fn().mockResolvedValue(undefined),
  listOracleResults: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../src/services/market.service", () => ({
  getPendingResolutions: jest.fn().mockResolvedValue([]),
  resolveMarket: jest.fn().mockResolvedValue({ status: "ok" }),
}));

jest.mock("../../src/services/audit.service", () => ({
  getAuditLogs: jest.fn().mockResolvedValue({ logs: [], pagination: { page: 1, limit: 10, total: 0, pages: 0 } }),
}));

jest.mock("../../src/api/middleware/audit-log.middleware", () => ({
  auditLogMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../src/logger", () => ({
  httpLogger: (_req: any, _res: any, next: any) => next(),
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// ─── Test setup ──────────────────────────────────────────────────────────────

const ADMIN_KEY = "test-admin-key-1219";
const ORACLE_KEY = "test-oracle-key-1221";
const VALID_STELLAR = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

let app: ReturnType<typeof createApp>;

beforeAll(() => {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  process.env.ORACLE_API_KEY = ORACLE_KEY;
  app = createApp();
});

// ─── #1219: Admin routes protected by adminAuth ──────────────────────────────

describe("#1219 — /api/admin/* protected by adminAuth", () => {
  const adminRoutes = [
    { method: "get", path: "/api/admin/markets/pending" },
    { method: "post", path: "/api/admin/markets/resolve" },
    { method: "post", path: "/api/admin/markets/dispute/resolve" },
    { method: "get", path: "/api/admin/oracles" },
    { method: "post", path: "/api/admin/oracles" },
    { method: "get", path: "/api/admin/audit-logs" },
  ];

  describe("without credentials → 401", () => {
    test.each(adminRoutes)("$method $path", async ({ method, path }) => {
      const res = await (request(app) as any)[method](path);
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  describe("with wrong key → 401", () => {
    test.each(adminRoutes)("$method $path", async ({ method, path }) => {
      const res = await (request(app) as any)
        [method](path)
        .set("X-Admin-Key", "wrong-key");
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  it("GET /api/admin/oracles with valid credentials → 200", async () => {
    const res = await request(app)
      .get("/api/admin/oracles")
      .set("X-Admin-Key", ADMIN_KEY);
    expect(res.status).toBe(200);
  });

  it("GET /api/admin/markets/pending with valid credentials → 200", async () => {
    const res = await request(app)
      .get("/api/admin/markets/pending")
      .set("X-Admin-Key", ADMIN_KEY);
    expect(res.status).toBe(200);
  });

  it("GET /api/admin/audit-logs with valid credentials → 200", async () => {
    const res = await request(app)
      .get("/api/admin/audit-logs")
      .set("X-Admin-Key", ADMIN_KEY);
    expect(res.status).toBe(200);
  });
});

// ─── #1220: GET /api/auth/challenge ─────────────────────────────────────────

describe("#1220 — GET /api/auth/challenge", () => {
  it("returns 200 with challenge and expiresAt for a valid Stellar address", async () => {
    const res = await request(app)
      .get("/api/auth/challenge")
      .query({ address: VALID_STELLAR });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("challenge");
    expect(res.body).toHaveProperty("expiresAt");
    expect(typeof res.body.challenge).toBe("string");
    expect(typeof res.body.expiresAt).toBe("number");
    expect(res.body.challenge).toContain(VALID_STELLAR);
  });

  it("returns 400 for an invalid Stellar address", async () => {
    const res = await request(app)
      .get("/api/auth/challenge")
      .query({ address: "not-a-stellar-address" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "INVALID_ADDRESS" });
  });

  it("returns 400 when address query param is omitted", async () => {
    const res = await request(app).get("/api/auth/challenge");
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "INVALID_ADDRESS" });
  });
});

// ─── #1221: Oracle routes mounted and protected ──────────────────────────────

describe("#1221 — /api/oracle/* mounted and protected", () => {
  describe("POST /api/oracle/submit", () => {
    it("returns 401 without credentials", async () => {
      const res = await request(app)
        .post("/api/oracle/submit")
        .send({ market_id: "m1", outcome: "fighter_a", source: "api" });

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("returns 401 with wrong oracle key", async () => {
      const res = await request(app)
        .post("/api/oracle/submit")
        .set("X-Oracle-Key", "wrong-key")
        .send({ market_id: "m1", outcome: "fighter_a", source: "api" });

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("returns 201 with valid oracle key and body", async () => {
      const res = await request(app)
        .post("/api/oracle/submit")
        .set("X-Oracle-Key", ORACLE_KEY)
        .send({ market_id: "m1", outcome: "fighter_a", source: "api" });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
    });
  });

  describe("GET /api/oracle/results", () => {
    it("is reachable (route is mounted)", async () => {
      // The handler currently throws "Not implemented", which should produce
      // a JSON 500 via errorHandlerMiddleware — NOT an HTML Express default.
      const res = await request(app).get("/api/oracle/results");
      expect(res.headers["content-type"]).toMatch(/json/);
      // Route exists (not 404) — either 500 stub or future 200.
      expect(res.status).not.toBe(404);
    });
  });
});

// ─── #1222: 404 handler and errorHandlerMiddleware ───────────────────────────

describe("#1222 — 404 handler and errorHandlerMiddleware", () => {
  it("unknown route returns 404 JSON with code NOT_FOUND", async () => {
    const res = await request(app).get("/api/does-not-exist-at-all");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body).toMatchObject({ code: "NOT_FOUND" });
  });

  it("unknown POST route also returns 404 JSON", async () => {
    const res = await request(app)
      .post("/api/totally-unknown-endpoint")
      .send({});
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: "NOT_FOUND" });
  });

  it("thrown error produces JSON response (not HTML)", async () => {
    // GET /api/oracle/results throws "Not implemented" — errorHandlerMiddleware
    // must catch it and return JSON, not Express default HTML.
    const res = await request(app).get("/api/oracle/results");
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body).toHaveProperty("code");
  });
});
