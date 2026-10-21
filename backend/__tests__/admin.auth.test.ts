/**
 * Admin authentication: the adminAuth middleware (#910) and X-Admin-Key
 * header consistency on /api/admin/* (B-46).
 */

import request from "supertest";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import marketRoutes from "../src/api/routes/market.routes";
import usersRoutes from "../src/api/routes/users.routes";
import authRoutes from "../src/api/routes/auth.routes";
import adminRoutes from "../src/api/routes/admin.routes";
import { adminAuth } from "../src/api/middleware/adminAuth";
import * as marketService from "../src/services/market.service";

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("../src/services/market.service");
jest.mock("../src/services/user.service");
jest.mock("../src/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  httpLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mockedMarketService = jest.mocked(marketService);

const ADMIN_KEY = "admin-secret";

// ─── Test app factory ─────────────────────────────────────────────────────────

function createTestApp() {
  const app = express();
  app.set("json replacer", (_key: string, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value
  );
  app.use(express.json());
  app.use("/api/markets", marketRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/admin", adminRoutes);
  return app;
}

function mockRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status, json } as unknown as Response, status, json };
}

// ─── #910 adminAuth middleware ───────────────────────────────────────────────

describe("#910 adminAuth middleware", () => {
  beforeEach(() => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
  });

  it("calls next() with correct Bearer key", () => {
    const req = { headers: { authorization: `Bearer ${ADMIN_KEY}` } } as unknown as Request;
    const { res } = mockRes();
    const next = jest.fn() as unknown as NextFunction;
    adminAuth(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("returns 401 when Authorization header is missing", () => {
    const req = { headers: {} } as unknown as Request;
    const { res, status, json } = mockRes();
    const next = jest.fn() as unknown as NextFunction;
    adminAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Unauthorized", code: "UNAUTHORIZED" });
  });

  it("returns 401 when key is wrong", () => {
    const req = { headers: { authorization: "Bearer wrong-key" } } as unknown as Request;
    const { res, status, json } = mockRes();
    const next = jest.fn() as unknown as NextFunction;
    adminAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Unauthorized", code: "UNAUTHORIZED" });
  });

  it("returns 401 when Bearer prefix is missing", () => {
    const req = { headers: { authorization: ADMIN_KEY } } as unknown as Request;
    const { res, status } = mockRes();
    const next = jest.fn() as unknown as NextFunction;
    adminAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });
});

// ─── B-46: Admin auth uses X-Admin-Key ────────────────────────────────────────

describe("B-46: Admin auth header consistency", () => {
  beforeEach(() => {
    process.env.ADMIN_API_KEY = "test-admin-key";
  });

  afterEach(() => {
    delete process.env.ADMIN_API_KEY;
  });

  it("rejects /api/admin/* when Authorization: Bearer is sent (old scheme)", async () => {
    const res = await request(createTestApp())
      .get("/api/admin/markets/pending")
      .set("Authorization", "Bearer test-admin-key");

    expect(res.status).toBe(401);
  });

  it("accepts /api/admin/* when X-Admin-Key is sent (new scheme)", async () => {
    mockedMarketService.getAllMarkets = jest.fn().mockResolvedValue([]) as jest.MockedFunction<typeof marketService.getAllMarkets>;

    const res = await request(createTestApp())
      .get("/api/admin/markets/pending")
      .set("X-Admin-Key", "test-admin-key");

    expect(res.status).toBe(200);
  });

  it("rejects /api/admin/* when X-Admin-Key is wrong", async () => {
    const res = await request(createTestApp())
      .get("/api/admin/markets/pending")
      .set("X-Admin-Key", "wrong-key");

    expect(res.status).toBe(401);
  });
});
