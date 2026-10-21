/**
 * 404 handler and errorHandlerMiddleware (#1222).
 */

import request from "supertest";
import { createApp } from "../src/app";

// ─── Shared mocks ────────────────────────────────────────────────────────────

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

let app: ReturnType<typeof createApp>;

beforeAll(() => {
  process.env.ADMIN_API_KEY = "test-admin-key-1219";
  process.env.ORACLE_API_KEY = "test-oracle-key-1221";
  app = createApp();
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
