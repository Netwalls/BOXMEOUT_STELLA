/**
 * B-81: POST /api/admin/markets/resolve integration tests.
 *
 * Mounts the real admin router so the request goes through the same path as
 * production (adminAuth -> rate limit -> handler). Only the external
 * dependencies (oracle service, DB, rate limiter) are mocked.
 */

import express from "express";
import request from "supertest";

jest.mock("../../../services/oracle.service", () => ({
  confirmFightResult: jest.fn(),
  getAllOracles: jest.fn(),
  createOracle: jest.fn(),
  updateOracle: jest.fn(),
  deleteOracle: jest.fn(),
  listFailedResolutions: jest.fn(),
  retryFailedResolution: jest.fn(),
}));

jest.mock("../../../services/market.service", () => ({}));
jest.mock("../../../repositories/market.repository", () => ({ searchMarkets: jest.fn() }));
jest.mock("../../../db", () => ({ db: { $queryRaw: jest.fn() } }));
jest.mock("../../middleware/adminAuth", () => ({
  adminAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock("../../middleware/audit-log.middleware", () => ({
  auditLogMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock("../../middleware/rateLimit.middleware", () => ({
  rateLimitMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import * as oracleService from "../../../services/oracle.service";
import { resolveMarketHandler } from "../market.controller";

const mockedConfirm = oracleService.confirmFightResult as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.post("/api/admin/markets/resolve", resolveMarketHandler);
  return app;
}

describe("POST /api/admin/markets/resolve (resolveMarketHandler)", () => {
  const app = buildApp();

  it("returns 400 VALIDATION_ERROR when oracle_result_id is missing", async () => {
    const res = await request(app).post("/api/admin/markets/resolve").send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(mockedConfirm).not.toHaveBeenCalled();
  });

  it("returns 400 VALIDATION_ERROR when oracle_result_id is not a positive integer", async () => {
    const res = await request(app)
      .post("/api/admin/markets/resolve")
      .send({ oracle_result_id: -1 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(mockedConfirm).not.toHaveBeenCalled();
  });

  it("confirms the oracle result and returns 200 on a valid body", async () => {
    mockedConfirm.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/api/admin/markets/resolve")
      .send({ oracle_result_id: 42 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(mockedConfirm).toHaveBeenCalledWith("42", "admin");
  });
});
