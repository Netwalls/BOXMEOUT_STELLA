/**
 * Integration test: GET /markets/search
 *
 * Mocks Prisma $queryRaw and ioredis so no real DB/Redis is required.
 */

// ── Prisma mock ──────────────────────────────────────────────────────────────
const mockQueryRaw = jest.fn();
jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({ $queryRaw: mockQueryRaw })),
}));

// ── ioredis mock ─────────────────────────────────────────────────────────────
const mockGet    = jest.fn().mockResolvedValue(null);
const mockSetex  = jest.fn().mockResolvedValue("OK");
jest.mock("ioredis", () =>
  jest.fn().mockImplementation(() => ({ get: mockGet, setex: mockSetex }))
);

import { searchMarkets } from "../src/repositories/market.repository";

const MARKET = {
  id: "mkt-1",
  contractAddress: "0xabc",
  question: "Will Fury beat Wilder?",
  description: "Heavyweight championship bout",
  tsVector: null,
};

describe("searchMarkets()", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns matching market when query is relevant", async () => {
    // First call → rows, second call → count
    mockQueryRaw
      .mockResolvedValueOnce([{ ...MARKET, rank: 0.9 }])
      .mockResolvedValueOnce([{ count: BigInt(1) }]);

    const result = await searchMarkets("Fury", 1, 20);

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect((result.data[0] as typeof MARKET).id).toBe("mkt-1");
  });

  it("returns empty when query is irrelevant", async () => {
    mockQueryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: BigInt(0) }]);

    const result = await searchMarkets("chess", 1, 20);

    expect(result.total).toBe(0);
    expect(result.data).toHaveLength(0);
  });

  it("returns cached result without hitting DB on second call", async () => {
    const cached = JSON.stringify({ data: [MARKET], total: 1 });
    mockGet.mockResolvedValueOnce(cached);

    const result = await searchMarkets("Fury", 1, 20);

    expect(mockQueryRaw).not.toHaveBeenCalled();
    expect(result.total).toBe(1);
  });

  it("caches the result after a DB hit", async () => {
    mockQueryRaw
      .mockResolvedValueOnce([MARKET])
      .mockResolvedValueOnce([{ count: BigInt(1) }]);

    await searchMarkets("Wilder", 1, 20);

    expect(mockSetex).toHaveBeenCalledWith(
      "search:Wilder:1:20",
      10,
      expect.any(String)
    );
  });
});
