/**
 * Admin market resolution controller (#909).
 */

import type { Request, Response, NextFunction } from "express";
import * as oracleService from "../src/services/oracle.service";
import { resolveMarketHandler } from "../src/api/controllers/market.controller";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("../src/services/oracle.service", () => ({
  submitFightResult: jest.fn(),
  confirmFightResult: jest.fn(),
}));

jest.mock("../src/logger", () => ({
  httpLogger: (_req: any, _res: any, next: any) => next(),
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// ─── Test setup ──────────────────────────────────────────────────────────────

const ADMIN_KEY = "admin-secret";

function mockRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status, json } as unknown as Response, status, json };
}

// ─── #909 resolveMarketHandler ───────────────────────────────────────────────

describe("#909 resolveMarketHandler", () => {
  beforeEach(() => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    jest.clearAllMocks();
  });

  it("returns 400 when oracle_result_id is missing", async () => {
    const req = { body: {} } as unknown as Request;
    const { res, status, json } = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await resolveMarketHandler(req, res, next);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
  });

  it("returns 400 when oracle_result_id is not a positive integer", async () => {
    const req = { body: { oracle_result_id: -1 } } as unknown as Request;
    const { res, status, json } = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await resolveMarketHandler(req, res, next);

    expect(status).toHaveBeenCalledWith(400);
  });

  it("returns 200 { status: ok } on valid call", async () => {
    (oracleService.confirmFightResult as jest.Mock).mockResolvedValue(undefined);

    const req = { body: { oracle_result_id: 42 } } as unknown as Request;
    const { res, status, json } = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await resolveMarketHandler(req, res, next);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ status: "ok" });
    expect(oracleService.confirmFightResult).toHaveBeenCalledWith("42", "admin");
  });
});
