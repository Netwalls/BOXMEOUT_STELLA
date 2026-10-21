import request from "supertest";
import express from "express";
import marketRoutes from "../src/api/routes/market.routes";
import adminRoutes from "../src/api/routes/admin.routes";
import * as marketService from "../src/services/market.service";
import { MarketStatus, Outcome } from "@prisma/client";

jest.mock("../src/services/market.service");
jest.mock("../src/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  httpLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mockedService = jest.mocked(marketService);

function createTestApp() {
  const app = express();
  app.set("json replacer", (_key: string, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value
  );
  app.use(express.json());
  app.use("/api/markets", marketRoutes);
  app.use("/api/admin", adminRoutes);
  return app;
}

const baseMarket = {
  id: "market-1",
  contractAddress: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  fighterA: { name: "Fighter A", record: "20-0" },
  fighterB: { name: "Fighter B", record: "18-2" },
  scheduledAt: new Date("2026-09-01T20:00:00Z"),
  bettingEndsAt: new Date("2026-09-01T18:00:00Z"),
  createdAt: new Date("2026-06-01T00:00:00Z"),
  createdBy: "GADMIN",
  status: "Open" as MarketStatus,
  outcome: null,
  resolvedAt: null,
  poolA: 5000n,
  poolB: 3000n,
  totalPool: 8000n,
  oracleAddress: "GORACLE",
  txHash: "abc123",
};

const baseStats = {
  totalBets: 10,
  uniqueBettors: 7,
  poolA: 5000n,
  poolB: 3000n,
  totalVolume: 8000n,
  impliedOddsA: 62.5,
  impliedOddsB: 37.5,
};

describe("GET /api/markets", () => {
  it("returns empty array when no markets exist", async () => {
    mockedService.getAllMarkets.mockResolvedValue([]);

    const res = await request(createTestApp()).get("/api/markets");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("returns markets with data", async () => {
    mockedService.getAllMarkets.mockResolvedValue([baseMarket] as unknown as Awaited<ReturnType<typeof marketService.getAllMarkets>>);

    const res = await request(createTestApp()).get("/api/markets");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe("market-1");
  });

  it("passes status filter to service", async () => {
    mockedService.getAllMarkets.mockResolvedValue([]);

    await request(createTestApp()).get("/api/markets?status=Open");

    expect(mockedService.getAllMarkets).toHaveBeenCalledWith(
      expect.objectContaining({ status: "Open" }),
      expect.any(Object)
    );
  });

  it("passes pagination params to service", async () => {
    mockedService.getAllMarkets.mockResolvedValue([]);

    const res = await request(createTestApp()).get("/api/markets?page=2&limit=5");

    expect(mockedService.getAllMarkets).toHaveBeenCalledWith(
      expect.any(Object),
      { page: 2, limit: 5 }
    );
    expect(res.body.meta.page).toBe(2);
    expect(res.body.limit).toBe(5);
  });

  it("passes weightClass filter to service", async () => {
    mockedService.getAllMarkets.mockResolvedValue([]);

    await request(createTestApp()).get("/api/markets?weightClass=Heavyweight");

    expect(mockedService.getAllMarkets).toHaveBeenCalledWith(
      expect.objectContaining({ weightClass: "Heavyweight" }),
      expect.any(Object)
    );
  });
});

describe("GET /api/markets/:id", () => {
  it("returns market when found", async () => {
    mockedService.getMarketById.mockResolvedValue(baseMarket as unknown as Awaited<ReturnType<typeof marketService.getMarketById>>);

    const res = await request(createTestApp()).get("/api/markets/market-1");

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe("market-1");
  });

  it("returns 404 when market not found", async () => {
    mockedService.getMarketById.mockResolvedValue(null);

    const res = await request(createTestApp()).get("/api/markets/nonexistent");

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Market not found");
  });

  it("serializes BigInt fields as strings", async () => {
    mockedService.getMarketById.mockResolvedValue(baseMarket as unknown as Awaited<ReturnType<typeof marketService.getMarketById>>);

    const res = await request(createTestApp()).get("/api/markets/market-1");

    expect(typeof res.body.data.poolA).toBe("string");
    expect(res.body.data.poolA).toBe("5000");
  });
});

describe("GET /api/markets/:id/stats", () => {
  it("returns stats with seeded bets", async () => {
    mockedService.getMarketStats.mockResolvedValue(baseStats as unknown as Awaited<ReturnType<typeof marketService.getMarketStats>>);

    const res = await request(createTestApp()).get("/api/markets/market-1/stats");

    expect(res.status).toBe(200);
    expect(res.body.data.totalBets).toBe(10);
    expect(res.body.data.uniqueBettors).toBe(7);
    expect(res.body.data.impliedOddsA).toBe(62.5);
    expect(res.body.data.impliedOddsB).toBe(37.5);
  });
});

describe("GET /api/markets/:id/bets", () => {
  it("returns bets for a market", async () => {
    mockedService.getMarketLeaderboard.mockResolvedValue([
      { bettor: "GADDR1", totalStaked: 2000n, betCount: 3 },
    ] as unknown as Awaited<ReturnType<typeof marketService.getMarketLeaderboard>>);

    const res = await request(createTestApp()).get("/api/markets/market-1/bets");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe("GET /api/admin/markets/pending", () => {
  it("returns locked markets awaiting resolution", async () => {
    const lockedMarket = { ...baseMarket, status: "Locked" as MarketStatus };
    mockedService.getAllMarkets.mockResolvedValue([lockedMarket] as unknown as Awaited<ReturnType<typeof marketService.getAllMarkets>>);

    const res = await request(createTestApp()).get("/api/admin/markets/pending");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe("Locked");
  });

  it("returns empty array when no locked markets exist", async () => {
    mockedService.getAllMarkets.mockResolvedValue([]);

    const res = await request(createTestApp()).get("/api/admin/markets/pending");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("queries service with Locked status filter", async () => {
    mockedService.getAllMarkets.mockResolvedValue([]);

    await request(createTestApp()).get("/api/admin/markets/pending");

    expect(mockedService.getAllMarkets).toHaveBeenCalledWith({ status: "Locked" });
  });
});
