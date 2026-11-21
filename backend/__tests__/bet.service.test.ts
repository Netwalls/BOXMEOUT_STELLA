import * as betService from "../src/services/bet.service";
import * as db from "../src/db";

jest.mock("../src/db", () => ({
  db: {
    bet: { upsert: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    market: { findUnique: jest.fn() },
  },
}));

const mockDb = db as any;

describe("calculatePotentialPayout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calculates correct payout for standard pool sizes and amount", async () => {
    // poolA: 1000, poolB: 2000, amount: 500 on FighterA (#1584: the stake joins both pools)
    // total' = 3000 + 500 = 3500, fee = 3500 * 200 / 10000 = 70, net = 3430
    // winning' = 1000 + 500 = 1500
    // payout = floor(500 * 3430 / 1500) = floor(1143.33) = 1143
    mockDb.db.market.findUnique.mockResolvedValue({
      id: "market-1",
      poolA: 1000n,
      poolB: 2000n,
      totalPool: 3000n,
    });

    const result = await betService.calculatePotentialPayout("market-1", "FighterA", 500n);
    expect(result).toBe(1143n);
  });

  it("calculates correct payout for different pool ratio", async () => {
    // poolA: 5000, poolB: 5000, amount: 1000 on FighterB
    // total' = 11000, fee = 220, net = 10780, winning' = 6000
    // payout = floor(1000 * 10780 / 6000) = floor(1796.67) = 1796
    mockDb.db.market.findUnique.mockResolvedValue({
      id: "market-2",
      poolA: 5000n,
      poolB: 5000n,
      totalPool: 10000n,
    });

    const result = await betService.calculatePotentialPayout("market-2", "FighterB", 1000n);
    expect(result).toBe(1796n);
  });

  it("quotes the whole net pool when the bet is the first on its side", async () => {
    // poolA: 0, poolB: 1000, amount: 500 on FighterA. The bet is the only winner,
    // so it takes the whole net pool, matching the contract (#1584).
    // total' = 1500, fee = 30, net = 1470, winning' = 500
    // payout = floor(500 * 1470 / 500) = 1470
    mockDb.db.market.findUnique.mockResolvedValue({
      id: "market-3",
      poolA: 0n,
      poolB: 1000n,
      totalPool: 1000n,
    });

    const result = await betService.calculatePotentialPayout("market-3", "FighterA", 500n);
    expect(result).toBe(1470n);
  });

  it("throws error if market not found", async () => {
    mockDb.db.market.findUnique.mockResolvedValue(null);

    await expect(betService.calculatePotentialPayout("unknown-market", "FighterA", 500n)).rejects.toThrow(
      "Market not found: unknown-market"
    );
  });
});

describe("recordBet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a bet when called first time", async () => {
    mockDb.db.market.findUnique.mockResolvedValue({ id: "market-1" });
    mockDb.db.bet.upsert.mockResolvedValue({
      id: "bet-1",
      marketId: "market-1",
      bettor: "GBETTOR1",
      side: "FighterA",
      amount: 1000n,
      placedAt: new Date("2026-07-01T10:00:00Z"),
    });

    const result = await betService.recordBet({
      id: "bet-1",
      marketId: "market-1",
      bettor: "GBETTOR1",
      side: "FighterA",
      amount: 1000n,
      placedAt: new Date("2026-07-01T10:00:00Z"),
    });

    expect(result.id).toBe("bet-1");
    expect(mockDb.db.bet.upsert).toHaveBeenCalledWith({
      where: { id: "bet-1" },
      update: {},
      create: expect.any(Object),
    });
  });

  it("is idempotent when called with same bet_id", async () => {
    mockDb.db.market.findUnique.mockResolvedValue({ id: "market-1" });
    mockDb.db.bet.upsert.mockResolvedValue({
      id: "bet-1",
      marketId: "market-1",
      bettor: "GBETTOR1",
      side: "FighterA",
      amount: 1000n,
      placedAt: new Date("2026-07-01T10:00:00Z"),
    });

    const betData = {
      id: "bet-1",
      marketId: "market-1",
      bettor: "GBETTOR1",
      side: "FighterA" as const,
      amount: 1000n,
      placedAt: new Date("2026-07-01T10:00:00Z"),
    };

    await betService.recordBet(betData);
    await betService.recordBet(betData);

    expect(mockDb.db.bet.upsert).toHaveBeenCalledTimes(2);
  });

  it("throws error if market does not exist", async () => {
    mockDb.db.market.findUnique.mockResolvedValue(null);

    await expect(
      betService.recordBet({
        id: "bet-1",
        marketId: "unknown-market",
        bettor: "GBETTOR1",
        side: "FighterA",
        amount: 1000n,
        placedAt: new Date(),
      })
    ).rejects.toThrow("Market not found: unknown-market");
  });
});
