/**
 * B-135 (#1571): GET /api/stats response shape and error handling.
 */
import request from "supertest";
import express from "express";
import statsRoutes from "../src/api/routes/stats.routes";
import * as statsService from "../src/services/stats.service";

jest.mock("../src/services/stats.service", () => ({
  getPlatformStats: jest.fn(),
}));
jest.mock("../src/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  httpLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mockedGetStats = jest.mocked(statsService.getPlatformStats);

function createApp() {
  const app = express();
  app.use("/api/stats", statsRoutes);
  return app;
}

describe("#1571 GET /api/stats", () => {
  it("returns the totals with BigInt values as strings", async () => {
    mockedGetStats.mockResolvedValue({
      totalVolume: "800000000",
      totalPaidOut: "300000000",
      totalMarkets: 12,
      openMarkets: 3,
      uniqueBettors: 40,
    });

    const res = await request(createApp()).get("/api/stats");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      totalVolume: "800000000",
      totalPaidOut: "300000000",
      totalMarkets: 12,
      openMarkets: 3,
      uniqueBettors: 40,
    });
  });

  it("returns a 500 envelope when the aggregate fails", async () => {
    mockedGetStats.mockRejectedValue(new Error("db down"));

    const res = await request(createApp()).get("/api/stats");

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
  });
});
