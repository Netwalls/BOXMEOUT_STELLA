/**
 * Oracle submission: route mounting and auth (#1221) and the controller (#908).
 */

import request from "supertest";
import type { Request, Response, NextFunction } from "express";
import { createApp } from "../src/app";
import * as oracleService from "../src/services/oracle.service";
import { submitOracleResultHandler } from "../src/api/controllers/oracle.controller";

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

const ORACLE_KEY = "oracle-secret";
const ADMIN_KEY = "admin-secret";

function mockRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status, json } as unknown as Response, status, json };
}

let app: ReturnType<typeof createApp>;

beforeAll(() => {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  process.env.ORACLE_API_KEY = ORACLE_KEY;
  app = createApp();
});

// ─── #1221: /api/oracle/* mounted and protected ──────────────────────────────

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

// ─── #908 submitOracleResultHandler ─────────────────────────────────────────

describe("#908 submitOracleResultHandler", () => {
  const validBody = { market_id: "fight-1", outcome: "fighter_a", source: "boxing-api" };

  beforeEach(() => {
    process.env.ORACLE_API_KEY = ORACLE_KEY;
    jest.clearAllMocks();
  });

  it("returns 401 when Authorization header is missing", async () => {
    const req = { headers: {}, body: validBody } as unknown as Request;
    const { res, status, json } = mockRes();
    const next = jest.fn() as unknown as NextFunction;
    await submitOracleResultHandler(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Unauthorized", code: "UNAUTHORIZED" });
  });

  it("returns 401 when wrong API key is provided", async () => {
    const req = {
      headers: { authorization: "Bearer wrong-key" },
      body: validBody,
    } as unknown as Request;
    const { res, status, json } = mockRes();
    const next = jest.fn() as unknown as NextFunction;
    await submitOracleResultHandler(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Unauthorized", code: "UNAUTHORIZED" });
  });

  it("returns 201 with OracleResult on valid submission", async () => {
    const fakeResult = { id: 1, market_id: "fight-1", outcome: "fighter_a", source: "boxing-api" };
    (oracleService.submitFightResult as jest.Mock).mockResolvedValue(fakeResult);

    const req = {
      headers: { authorization: `Bearer ${ORACLE_KEY}` },
      body: validBody,
    } as unknown as Request;
    const { res, status, json } = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await submitOracleResultHandler(req, res, next);

    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith(fakeResult);
  });
});
