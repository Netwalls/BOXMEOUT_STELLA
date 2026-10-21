import request from "supertest";
import express from "express";
import betRoutes from "../src/api/routes/bet.routes";
import * as betService from "../src/services/bet.service";
import { BetSide } from "@prisma/client";

jest.mock("../src/services/bet.service");
jest.mock("../src/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  httpLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mockedService = jest.mocked(betService);

function createTestApp() {
  const app = express();
  app.set("json replacer", (_key: string, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value
  );
  app.use(express.json());
  app.use("/api/bets", betRoutes);
  return app;
}

const baseBet = {
  id: "bet-1",
  marketId: "market-1",
  bettor: "GBETTOR1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  side: "FighterA" as BetSide,
  amount: 1000n,
  placedAt: new Date("2026-07-01T10:00:00Z"),
  claimed: false,
  claimedAt: null,
  payout: null,
  txHash: "txhash1",
};

const basePortfolio = {
  totalStaked: 5000n,
  totalWinnings: 1500n,
  pendingClaims: 750n,
  activeBets: 3,
  completedBets: 7,
  roi: 30.0,
};

describe("GET /api/bets/:address", () => {
  it("returns empty array when address has no bets", async () => {
    mockedService.getBetsByAddress.mockResolvedValue([]);

    const res = await request(createTestApp()).get("/api/bets/GNOBET1");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("returns bets for an address with bets", async () => {
    mockedService.getBetsByAddress.mockResolvedValue([baseBet] as unknown as Awaited<ReturnType<typeof betService.getBetsByAddress>>);

    const res = await request(createTestApp()).get("/api/bets/GBETTOR1");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe("bet-1");
    expect(res.body.data[0].side).toBe("FighterA");
  });

  it("passes status filter to service", async () => {
    mockedService.getBetsByAddress.mockResolvedValue([]);

    await request(createTestApp()).get("/api/bets/GBETTOR1?status=won");

    expect(mockedService.getBetsByAddress).toHaveBeenCalledWith(
      "GBETTOR1",
      expect.objectContaining({ status: "won" })
    );
  });

  it("passes marketId filter to service", async () => {
    mockedService.getBetsByAddress.mockResolvedValue([]);

    await request(createTestApp()).get("/api/bets/GBETTOR1?marketId=market-1");

    expect(mockedService.getBetsByAddress).toHaveBeenCalledWith(
      "GBETTOR1",
      expect.objectContaining({ marketId: "market-1" })
    );
  });

  it("serializes BigInt amount as string", async () => {
    mockedService.getBetsByAddress.mockResolvedValue([baseBet] as unknown as Awaited<ReturnType<typeof betService.getBetsByAddress>>);

    const res = await request(createTestApp()).get("/api/bets/GBETTOR1");

    expect(typeof res.body.data[0].amount).toBe("string");
    expect(res.body.data[0].amount).toBe("1000");
  });
});

describe("GET /api/bets/:address/portfolio", () => {
  it("returns zero-value portfolio for address with no bets", async () => {
    const emptyPortfolio = {
      totalStaked: 0n,
      totalWinnings: 0n,
      pendingClaims: 0n,
      activeBets: 0,
      completedBets: 0,
      roi: 0,
    };
    mockedService.getPortfolioSummary.mockResolvedValue(emptyPortfolio as unknown as Awaited<ReturnType<typeof betService.getPortfolioSummary>>);

    const res = await request(createTestApp()).get("/api/bets/GNOBET1/portfolio");

    expect(res.status).toBe(200);
    expect(res.body.data.activeBets).toBe(0);
    expect(res.body.data.completedBets).toBe(0);
    expect(res.body.data.roi).toBe(0);
  });

  it("returns correct portfolio stats matching seeded data", async () => {
    mockedService.getPortfolioSummary.mockResolvedValue(basePortfolio as unknown as Awaited<ReturnType<typeof betService.getPortfolioSummary>>);

    const res = await request(createTestApp()).get("/api/bets/GBETTOR1/portfolio");

    expect(res.status).toBe(200);
    expect(res.body.data.activeBets).toBe(3);
    expect(res.body.data.completedBets).toBe(7);
    expect(res.body.data.roi).toBe(30.0);
    expect(res.body.data.totalStaked).toBe("5000");
    expect(res.body.data.totalWinnings).toBe("1500");
    expect(res.body.data.pendingClaims).toBe("750");
  });
});

describe("GET /api/bets/payout-estimate", () => {
  it("returns estimated payout for valid inputs", async () => {
    mockedService.calculatePotentialPayout.mockResolvedValue(1800n);

    const res = await request(createTestApp())
      .get("/api/bets/payout-estimate")
      .query({ market_id: "market-1", side: "FighterA", amount: "1000" });

    expect(res.status).toBe(200);
    expect(res.body.data.estimatedPayout).toBe("1800");
  });

  it("calls service with correct BigInt amount", async () => {
    mockedService.calculatePotentialPayout.mockResolvedValue(1800n);

    await request(createTestApp())
      .get("/api/bets/payout-estimate")
      .query({ market_id: "market-1", side: "FighterA", amount: "1000" });

    expect(mockedService.calculatePotentialPayout).toHaveBeenCalledWith(
      "market-1",
      "FighterA",
      BigInt(1000)
    );
  });

  it("returns 400 when market_id is missing", async () => {
    const res = await request(createTestApp())
      .get("/api/bets/payout-estimate")
      .query({ side: "FighterA", amount: "1000" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when side is missing", async () => {
    const res = await request(createTestApp())
      .get("/api/bets/payout-estimate")
      .query({ market_id: "market-1", amount: "1000" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when amount is missing", async () => {
    const res = await request(createTestApp())
      .get("/api/bets/payout-estimate")
      .query({ market_id: "market-1", side: "FighterA" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when side is invalid", async () => {
    const res = await request(createTestApp())
      .get("/api/bets/payout-estimate")
      .query({ market_id: "market-1", side: "InvalidSide", amount: "1000" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when amount is not a positive integer", async () => {
    const res = await request(createTestApp())
      .get("/api/bets/payout-estimate")
      .query({ market_id: "market-1", side: "FighterA", amount: "-5" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 429 after exceeding rate limit of 30 requests per minute", async () => {
    mockedService.calculatePotentialPayout.mockResolvedValue(1800n);
    const app = createTestApp();

    for (let i = 0; i < 30; i++) {
      await request(app)
        .get("/api/bets/payout-estimate")
        .query({ market_id: "market-1", side: "FighterA", amount: "1000" });
    }

    const res = await request(app)
      .get("/api/bets/payout-estimate")
      .query({ market_id: "market-1", side: "FighterA", amount: "1000" });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  }, 30000);
});
