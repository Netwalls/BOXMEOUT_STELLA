/**
 * User portfolio controller (#907).
 */

import type { Request, Response, NextFunction } from "express";
import * as betService from "../src/services/bet.service";
import { getPortfolioHandler } from "../src/api/controllers/bet.controller";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("../src/services/bet.service", () => ({
  getPortfolioSummary: jest.fn(),
}));

jest.mock("../src/logger", () => ({
  httpLogger: (_req: any, _res: any, next: any) => next(),
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// ─── Test setup ──────────────────────────────────────────────────────────────

const VALID_STELLAR = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

function mockRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status, json } as unknown as Response, status, json };
}

// ─── #907 getPortfolioHandler ────────────────────────────────────────────────

describe("#907 getPortfolioHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 for invalid Stellar address", async () => {
    const req = { params: { address: "invalid" } } as unknown as Request;
    const { res, status, json } = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await getPortfolioHandler(req, res, next);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
  });

  it("returns 200 with portfolio for a valid address", async () => {
    const portfolio = {
      totalStaked: BigInt(0),
      totalWinnings: BigInt(0),
      pendingClaims: BigInt(0),
      activeBets: 0,
      completedBets: 0,
      roi: 0,
    };
    (betService.getPortfolioSummary as jest.Mock).mockResolvedValue(portfolio);

    const req = { params: { address: VALID_STELLAR } } as unknown as Request;
    const { res, status, json } = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await getPortfolioHandler(req, res, next);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(portfolio);
  });
});
