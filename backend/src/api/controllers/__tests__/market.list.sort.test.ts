/**
 * B-122 (#1558): GET /api/markets validates sort/order and forwards the
 * category filter to the service.
 */
import express from "express";
import request from "supertest";
import { getMarketsHandler } from "../marketList.controller";
import * as marketService from "../../../services/market-list.service";

jest.mock("../../../services/market-list.service", () => ({
  getAllMarkets: jest.fn(),
}));
jest.mock("../../../logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
  sanitizeErrorForLog: (e: unknown) => e,
}));

const getAllMarkets = marketService.getAllMarkets as unknown as jest.Mock;

function buildApp() {
  const app = express();
  app.get("/api/markets", getMarketsHandler);
  return app;
}

describe("GET /api/markets sort and category", () => {
  beforeEach(() => {
    getAllMarkets.mockResolvedValue({ data: [{ id: "m1" }], total: 1 });
  });

  it("rejects a sort value outside the whitelist with 400 VALIDATION_ERROR", async () => {
    const res = await request(buildApp()).get("/api/markets?sort=random");

    expect(res.status).toBe(400);
    expect(res.body.error?.code ?? res.body.code).toBe("VALIDATION_ERROR");
    expect(getAllMarkets).not.toHaveBeenCalled();
  });

  it("rejects an order value other than asc or desc", async () => {
    const res = await request(buildApp()).get("/api/markets?sort=pool&order=sideways");

    expect(res.status).toBe(400);
    expect(getAllMarkets).not.toHaveBeenCalled();
  });

  it("forwards sort, order and categoryId to the service", async () => {
    const res = await request(buildApp()).get(
      "/api/markets?sort=pool&order=desc&categoryId=cat-9"
    );

    expect(res.status).toBe(200);
    expect(getAllMarkets).toHaveBeenCalledWith(
      { status: undefined, weightClass: undefined, categoryId: "cat-9" },
      { page: 1, pageSize: 20 },
      "pool",
      "desc"
    );
  });

  it("defaults to soonest ascending when sort and order are omitted", async () => {
    await request(buildApp()).get("/api/markets");

    expect(getAllMarkets).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      "soonest",
      "asc"
    );
  });
});
