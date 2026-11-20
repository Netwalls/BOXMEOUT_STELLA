/**
 * B-136 (#1572): /api/markets/trending is registered before /:id, validates its
 * query, and returns the ranked list. The market controllers and service are mocked.
 */
import request from "supertest";
import express from "express";
import marketRoutes from "../src/api/routes/market.routes";
import * as trendingService from "../src/services/trending.service";
import * as marketController from "../src/api/controllers/market.controller";

jest.mock("../src/db", () => ({ db: {} }));
jest.mock("../src/lib/redis", () => ({ redis: { get: jest.fn(), set: jest.fn() } }));
jest.mock("../src/services/trending.service", () => {
  const actual = jest.requireActual("../src/services/trending.service");
  return { ...actual, getTrendingMarkets: jest.fn() };
});
jest.mock("../src/api/controllers/market.controller", () => ({
  getMarketsHandler: jest.fn(),
  getMarketByIdHandler: jest.fn((_req: unknown, res: { json: (b: unknown) => void }) => res.json({ byId: true })),
  getMarketStatsHandler: jest.fn(),
  getMarketBetsHandler: jest.fn(),
  getMarketOddsHistoryHandler: jest.fn(),
  createMarketHandler: jest.fn(),
}));
jest.mock("../src/api/controllers/marketSearch.controller", () => ({ searchMarketsHandler: jest.fn() }));
jest.mock("../src/api/middleware/idempotency.middleware", () => ({
  idempotencyMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock("../src/api/middleware/validate", () => ({
  validate: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock("../src/events/marketEvents", () => ({ subscribeToMarket: jest.fn() }));
jest.mock("../src/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  httpLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mockedTrending = jest.mocked(trendingService.getTrendingMarkets);

function createApp() {
  const app = express();
  app.use("/api/markets", marketRoutes);
  return app;
}

describe("#1572 GET /api/markets/trending", () => {
  beforeEach(() => {
    jest.mocked(marketController.getMarketByIdHandler).mockClear();
  });

  it("is not captured by the /:id route", async () => {
    mockedTrending.mockResolvedValue([]);
    await request(createApp()).get("/api/markets/trending");
    expect(marketController.getMarketByIdHandler).not.toHaveBeenCalled();
  });

  it("returns ranked markets with the window and limit in meta", async () => {
    mockedTrending.mockResolvedValue([{ id: "m1", windowVolume: "900" }]);
    const res = await request(createApp()).get("/api/markets/trending?window=1h&limit=3");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ id: "m1", windowVolume: "900" }]);
    expect(res.body.meta).toEqual({ window: "1h", limit: 3 });
    expect(mockedTrending).toHaveBeenCalledWith({ window: "1h", limit: 3 });
  });

  it("defaults to 24h and 10 results", async () => {
    mockedTrending.mockResolvedValue([]);
    const res = await request(createApp()).get("/api/markets/trending");
    expect(res.body.meta).toEqual({ window: "24h", limit: 10 });
  });

  it("clamps the limit to 50", async () => {
    mockedTrending.mockResolvedValue([]);
    const res = await request(createApp()).get("/api/markets/trending?limit=999");
    expect(res.body.meta.limit).toBe(50);
  });

  it("rejects an unknown window with 400", async () => {
    const res = await request(createApp()).get("/api/markets/trending?window=30d");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockedTrending).not.toHaveBeenCalled();
  });
});
