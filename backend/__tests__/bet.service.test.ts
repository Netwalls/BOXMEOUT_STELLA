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
    // poolA: 1000, poolB: 2000, amount: 500 on FighterA
    // totalPool = 3000
    // fee = 3000 * 200 / 10000 = 60
    // netPool = 3000 - 60 = 2940
    // payout = (500 / (1000 + 500)) * 2940 = (500 / 1500) * 2940 = 980
    mockDb.db.market.findUnique.mockResolvedValue({
      id: "market-1",
      poolA: 1000n,
      poolB: 2000n,
      totalPool: 3000n,
    });

    const result = await betService.calculatePotentialPayout("market-1", "FighterA", 500n);
    expect(result).toBe(980n);
  });

  it("calculates correct payout for different pool ratio", async () => {
    // poolA: 5000, poolB: 5000, amount: 1000 on FighterB
    // totalPool = 10000
    // fee = 10000 * 200 / 10000 = 200
    // netPool = 10000 - 200 = 9800
    // payout = (1000 / (5000 + 1000)) * 9800 = (1000 / 6000) * 9800 = 1633
    mockDb.db.market.findUnique.mockResolvedValue({
      id: "market-2",
      poolA: 5000n,
      poolB: 5000n,
      totalPool: 10000n,
    });

    const result = await betService.calculatePotentialPayout("market-2", "FighterB", 1000n);
    expect(result).toBe(1633n);
  });

  it("returns 0n if winning pool is 0 (first bet on that side)", async () => {
    // poolA: 0, poolB: 1000
    mockDb.db.market.findUnique.mockResolvedValue({
      id: "market-3",
      poolA: 0n,
      poolB: 1000n,
      totalPool: 1000n,
    });

    const result = await betService.calculatePotentialPayout("market-3", "FighterA", 500n);
    expect(result).toBe(0n);
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
