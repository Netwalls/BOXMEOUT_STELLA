/**
 * Admin route protection (#1219).
 *
 * Uses supertest against the real Express app (no DB) so it stays fast and
 * requires no external services.  Service/DB calls that would fail in the test
 * environment are mocked at the module level.
 */

import request from "supertest";
import { createApp } from "../src/app";

// ─── Shared mocks ────────────────────────────────────────────────────────────

// Prevent real DB / Stellar calls from firing during route-level tests.
jest.mock("../src/services/oracle.service", () => ({
  submitFightResult: jest.fn().mockResolvedValue({ id: 1, market_id: "m1", outcome: "fighter_a" }),
  getAllOracles: jest.fn().mockResolvedValue([]),
  createOracle: jest.fn().mockResolvedValue({ id: "o1", address: "G".repeat(56), name: "Test" }),
  updateOracle: jest.fn().mockResolvedValue({ id: "o1", address: "G".repeat(56), name: "Updated" }),
  deleteOracle: jest.fn().mockResolvedValue({ id: "o1", active: false }),
  confirmFightResult: jest.fn().mockResolvedValue(undefined),
  listOracleResults: jest.fn().mockResolvedValue([]),
}));

jest.mock("../src/services/market.service", () => ({
  getPendingResolutions: jest.fn().mockResolvedValue([]),
  resolveMarket: jest.fn().mockResolvedValue({ status: "ok" }),
}));

jest.mock("../src/services/audit.service", () => ({
  getAuditLogs: jest.fn().mockResolvedValue({ logs: [], pagination: { page: 1, limit: 10, total: 0, pages: 0 } }),
}));

jest.mock("../src/api/middleware/audit-log.middleware", () => ({
  auditLogMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../src/logger", () => ({
  httpLogger: (_req: any, _res: any, next: any) => next(),
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// ─── Test setup ──────────────────────────────────────────────────────────────

const ADMIN_KEY = "test-admin-key-1219";
const ORACLE_KEY = "test-oracle-key-1221";

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
