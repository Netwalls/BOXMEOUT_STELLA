import express from "express";
import request from "supertest";
import { db } from "../../../db";
import * as oracleService from "../../../services/oracle.service";
import {
  resolveMarketByIdHandler,
  resolveMarketHandler,
} from "../marketResolution.controller";
import { errorHandlerMiddleware } from "../../middleware/errorHandler.middleware";

jest.mock("../../../db", () => ({
  db: { market: { findUnique: jest.fn() } },
}));

jest.mock("../../../services/oracle.service", () => ({
  enqueueResolution: jest.fn(),
}));

const findUnique = db.market.findUnique as unknown as jest.Mock;
const enqueueResolution = oracleService.enqueueResolution as unknown as jest.Mock;

// Mirrors the admin routes for resolution: the path route and the deprecated alias.
function buildApp() {
  const app = express();
  app.use(express.json());
  app.post("/api/admin/markets/:marketId/resolve", resolveMarketByIdHandler);
  app.post("/api/admin/markets/resolve", resolveMarketHandler);
  app.use(errorHandlerMiddleware);
  return app;
}

describe("POST /api/admin/markets/:marketId/resolve (#1393)", () => {
  beforeEach(() => {
    findUnique.mockResolvedValue({ id: "m1" });
    enqueueResolution.mockResolvedValue(undefined);
  });

  it("queues resolution for the market id in the path and the outcome in the body", async () => {
    const res = await request(buildApp())
      .post("/api/admin/markets/m1/resolve")
      .send({ outcome: "FighterA" });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ data: { success: true, marketId: "m1", outcome: "FighterA" } });
    expect(enqueueResolution).toHaveBeenCalledWith("m1", "FighterA");
  });

  it("returns 400 VALIDATION_ERROR for an outcome that is not a known value", async () => {
    const res = await request(buildApp())
      .post("/api/admin/markets/m1/resolve")
      .send({ outcome: "fighter_a" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(enqueueResolution).not.toHaveBeenCalled();
  });

  it("returns 404 NOT_FOUND when the market does not exist", async () => {
    findUnique.mockResolvedValue(null);

    const res = await request(buildApp())
      .post("/api/admin/markets/missing/resolve")
      .send({ outcome: "Draw" });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "NOT_FOUND" } });
    expect(enqueueResolution).not.toHaveBeenCalled();
  });

  it("passes service failures to the error handler", async () => {
    enqueueResolution.mockRejectedValue(new Error("redis down"));

    const res = await request(buildApp())
      .post("/api/admin/markets/m1/resolve")
      .send({ outcome: "NoContest" });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: { code: "INTERNAL_ERROR" } });
  });
});

describe("POST /api/admin/markets/resolve (deprecated alias, #1393)", () => {
  beforeEach(() => {
    findUnique.mockResolvedValue({ id: "m1" });
    enqueueResolution.mockResolvedValue(undefined);
  });

  it("still resolves using market_id in the body and marks the response deprecated", async () => {
    const res = await request(buildApp())
      .post("/api/admin/markets/resolve")
      .send({ market_id: "m1", outcome: "Draw" });

    expect(res.status).toBe(202);
    expect(res.headers["deprecation"]).toBe("true");
    expect(enqueueResolution).toHaveBeenCalledWith("m1", "Draw");
  });

  it("accepts marketId as well as market_id", async () => {
    const res = await request(buildApp())
      .post("/api/admin/markets/resolve")
      .send({ marketId: "m1", outcome: "FighterB" });

    expect(res.status).toBe(202);
    expect(enqueueResolution).toHaveBeenCalledWith("m1", "FighterB");
  });

  it("returns 400 with the deprecation header when the outcome is missing", async () => {
    const res = await request(buildApp())
      .post("/api/admin/markets/resolve")
      .send({ market_id: "m1" });

    expect(res.status).toBe(400);
    expect(res.headers["deprecation"]).toBe("true");
    expect(enqueueResolution).not.toHaveBeenCalled();
  });
});
