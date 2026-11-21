/**
 * B-158: GET /api/markets/suggest validation, response shape and route order.
 * The repository is mocked, so no DB or Redis is needed.
 */
const mockSuggest = jest.fn();
jest.mock("../../../repositories/market.repository", () => ({
  searchMarkets: jest.fn(),
  suggestMarkets: (...args: unknown[]) => mockSuggest(...args),
}));

import express from "express";
import request from "supertest";
import { suggestMarketsHandler } from "../marketSearch.controller";

function buildApp() {
  const app = express();
  app.get("/suggest", suggestMarketsHandler);
  return app;
}

describe("suggestMarketsHandler", () => {
  beforeEach(() => {
    mockSuggest.mockResolvedValue([{ id: "m1", label: "Fury vs Usyk" }]);
  });

  it("returns suggestions in the { data } envelope", async () => {
    const res = await request(buildApp()).get("/suggest").query({ q: "fu" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [{ id: "m1", label: "Fury vs Usyk" }] });
    expect(mockSuggest).toHaveBeenCalledWith("fu");
  });

  it("trims whitespace before validating and querying", async () => {
    await request(buildApp()).get("/suggest").query({ q: "  fu  " });
    expect(mockSuggest).toHaveBeenCalledWith("fu");
  });

  it("rejects a query shorter than two characters", async () => {
    const res = await request(buildApp()).get("/suggest").query({ q: "f" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toBe("q must be at least 2 characters");
    expect(mockSuggest).not.toHaveBeenCalled();
  });

  it("rejects a missing q", async () => {
    const res = await request(buildApp()).get("/suggest");

    expect(res.status).toBe(400);
    expect(mockSuggest).not.toHaveBeenCalled();
  });

  it("rejects a query longer than 100 characters", async () => {
    const res = await request(buildApp()).get("/suggest").query({ q: "a".repeat(101) });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("q must be at most 100 characters");
    expect(mockSuggest).not.toHaveBeenCalled();
  });

  it("rejects an array-valued q", async () => {
    const res = await request(buildApp()).get("/suggest?q=ab&q=cd");

    expect(res.status).toBe(400);
    expect(mockSuggest).not.toHaveBeenCalled();
  });

  it("passes wildcard characters through to the repository unchanged", async () => {
    await request(buildApp()).get("/suggest").query({ q: "50%_" });
    expect(mockSuggest).toHaveBeenCalledWith("50%_");
  });

  it("returns 500 without leaking internals when the query fails", async () => {
    mockSuggest.mockRejectedValue(new Error("connection string leaked"));

    const res = await request(buildApp()).get("/suggest").query({ q: "fu" });

    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe("Internal server error");
    expect(JSON.stringify(res.body)).not.toContain("connection string");
  });
});

describe("market router", () => {
  it("declares /suggest before /:id so it is not captured as a market id", () => {
    jest.isolateModules(() => {
      // Stub every module the router pulls in, so no DB, Redis or env is needed.
      const passthrough = () => (_req: unknown, _res: unknown, next: () => void) => next();
      const stub = () => jest.fn();
      jest.doMock("../../../events/marketEvents", () => ({ subscribeToMarket: stub() }));
      jest.doMock("../marketSearch.controller", () => ({
        searchMarketsHandler: stub(),
        suggestMarketsHandler: stub(),
      }));
      jest.doMock("../market.controller", () => ({
        getMarketsHandler: stub(),
        getMarketByIdHandler: stub(),
        getMarketStatsHandler: stub(),
        getMarketBetsHandler: stub(),
        getMarketOddsHistoryHandler: stub(),
        createMarketHandler: stub(),
      }));
      jest.doMock("../../middleware/walletAuth.middleware", () => ({ walletAuthMiddleware: passthrough }));
      jest.doMock("../../middleware/idempotency.middleware", () => ({ idempotencyMiddleware: passthrough }));
      jest.doMock("../../middleware/creatorBinding.middleware", () => ({ enforceCreatorBinding: passthrough() }));
      jest.doMock("../../middleware/rateLimit.middleware", () => ({ rateLimitMiddleware: passthrough }));
      jest.doMock("../../middleware/validate", () => ({ validate: passthrough }));
      jest.doMock("../../schemas/market.schema", () => ({ createMarketSchema: {} }));

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const router = require("../../routes/market.routes").default;
      const paths: string[] = router.stack
        .map((layer: { route?: { path: string } }) => layer.route?.path)
        .filter(Boolean);

      expect(paths).toContain("/suggest");
      expect(paths.indexOf("/suggest")).toBeLessThan(paths.indexOf("/:id"));
    });
  });
});
