import {
  fetchMarkets,
  fetchMarketById,
  fetchMarketStats,
  fetchMarketBets,
  fetchBetsByAddress,
  fetchPortfolioSummary,
  fetchPayoutEstimate,
  fetchOddsHistory,
  fetchUserPositions,
  createMarketMeta,
  ApiError,
  Market,
  Bet,
  MarketStats,
  OddsSnapshot,
  PortfolioSummary,
} from "@/lib/api";

const MARKET: Market = {
  id: "mkt-1",
  contractAddress: "CA1",
  fighterA: { name: "Ali", record: "20-0", nationality: "USA", weightClass: "Heavyweight" },
  fighterB: { name: "Foreman", record: "18-2", nationality: "USA", weightClass: "Heavyweight" },
  scheduledAt: "2026-07-01T20:00:00Z",
  bettingEndsAt: "2026-07-01T19:00:00Z",
  status: "Open",
  outcome: null,
  poolA: "1000000000",
  poolB: "500000000",
  totalPool: "1500000000",
  oracleAddress: "GORACLE",
  createdBy: "GCREATOR",
};

const BET: Bet = {
  id: "bet-1",
  marketId: "mkt-1",
  bettor: "GADDR1",
  side: "FighterA",
  amount: "100000000",
  placedAt: "2026-06-20T10:00:00Z",
  claimed: false,
  payout: null,
};

const STATS: MarketStats = {
  totalBets: 10,
  uniqueBettors: 5,
  poolA: "1000000000",
  poolB: "500000000",
  totalVolume: "1500000000",
  impliedOddsA: 66.7,
  impliedOddsB: 33.3,
};

const SNAPSHOT: OddsSnapshot = {
  timestamp: "2026-06-20T10:00:00Z",
  poolA: "1000000000",
  poolB: "500000000",
  oddsA: 66.7,
  oddsB: 33.3,
};

const SUMMARY: PortfolioSummary = {
  totalStaked: "100000000",
  totalWinnings: "0",
  pendingClaims: "0",
  activeBets: 1,
  completedBets: 0,
  roi: 0,
};

function mockOk(body: unknown) {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(""),
  });
}

function mockError(status: number, message = "Server error") {
  return jest.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ message }),
    text: () => Promise.resolve(message),
  });
}

afterEach(() => jest.restoreAllMocks());

// ─── fetchMarkets ─────────────────────────────────────────────────────────────

test("fetchMarkets: returns market array", async () => {
  global.fetch = mockOk([MARKET]);
  const result = await fetchMarkets();
  expect(result).toEqual([MARKET]);
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/markets"),
    expect.any(Object)
  );
});

test("fetchMarkets: passes query params", async () => {
  global.fetch = mockOk([MARKET]);
  await fetchMarkets({ status: "Open", weightClass: "Heavyweight", page: 2, limit: 10 });
  const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
  expect(url).toContain("status=Open");
  expect(url).toContain("weightClass=Heavyweight");
  expect(url).toContain("page=2");
  expect(url).toContain("limit=10");
});

test("fetchMarkets: throws ApiError on 500", async () => {
  global.fetch = mockError(500);
  await expect(fetchMarkets()).rejects.toBeInstanceOf(ApiError);
  await expect(fetchMarkets()).rejects.toMatchObject({ status: 500 });
});

// ─── fetchMarketById ──────────────────────────────────────────────────────────

test("fetchMarketById: returns market", async () => {
  global.fetch = mockOk(MARKET);
  const result = await fetchMarketById("mkt-1");
  expect(result).toEqual(MARKET);
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/markets/mkt-1"),
    expect.any(Object)
  );
});

test("fetchMarketById: throws ApiError with status 404", async () => {
  global.fetch = mockError(404, "Not found");
  const err = await fetchMarketById("missing").catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBe(404);
  expect(err.message).toBe("Not found");
});

// ─── fetchMarketStats ─────────────────────────────────────────────────────────

test("fetchMarketStats: returns stats", async () => {
  global.fetch = mockOk(STATS);
  const result = await fetchMarketStats("mkt-1");
  expect(result).toEqual(STATS);
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/markets/mkt-1/stats"),
    expect.any(Object)
  );
});

// ─── fetchMarketBets ──────────────────────────────────────────────────────────

// ─── fetchMarketBets ──────────────────────────────────────────────────────────

test("fetchMarketBets: returns bets array", async () => {
  global.fetch = mockOk([BET]);
  const result = await fetchMarketBets("mkt-1");
  expect(result).toEqual([BET]);
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/markets/mkt-1/bets"),
    expect.any(Object)
  );
});

test("fetchMarketBets: passes outcome filter query param", async () => {
  global.fetch = mockOk([BET]);
  await fetchMarketBets("mkt-1", { outcome: "FighterA" });
  const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
  expect(url).toContain("outcome=FighterA");
});

// ─── fetchBetsByAddress ───────────────────────────────────────────────────────

test("fetchBetsByAddress: returns bets for address", async () => {
  global.fetch = mockOk([BET]);
  const result = await fetchBetsByAddress("GADDR1");
  expect(result).toEqual([BET]);
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/bets/GADDR1"),
    expect.any(Object)
  );
});

// ─── fetchPortfolioSummary ────────────────────────────────────────────────────

test("fetchPortfolioSummary: returns summary", async () => {
  global.fetch = mockOk(SUMMARY);
  const result = await fetchPortfolioSummary("GADDR1");
  expect(result).toEqual(SUMMARY);
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/bets/GADDR1/portfolio"),
    expect.any(Object)
  );
});

// ─── fetchPayoutEstimate ──────────────────────────────────────────────────────

test("fetchPayoutEstimate: returns BigInt from string estimate", async () => {
  global.fetch = mockOk({ estimate: "150000000" });
  const result = await fetchPayoutEstimate("mkt-1", "FighterA", BigInt(100000000));
  expect(result).toBe(BigInt(150000000));
  expect(typeof result).toBe("bigint");
});

test("fetchPayoutEstimate: passes correct query params", async () => {
  global.fetch = mockOk({ estimate: "0" });
  await fetchPayoutEstimate("mkt-1", "FighterB", BigInt(50000000));
  const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
  expect(url).toContain("market_id=mkt-1");
  expect(url).toContain("side=FighterB");
  expect(url).toContain("amount=50000000");
});

test("fetchPayoutEstimate: throws ApiError on non-2xx", async () => {
  global.fetch = mockError(400, "Bad request");
  await expect(fetchPayoutEstimate("mkt-1", "FighterA", BigInt(1))).rejects.toBeInstanceOf(ApiError);
});

// ─── fetchOddsHistory ─────────────────────────────────────────────────────────

test("fetchOddsHistory: returns snapshots array", async () => {
  global.fetch = mockOk([SNAPSHOT]);
  const result = await fetchOddsHistory("mkt-1");
  expect(result).toEqual([SNAPSHOT]);
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/markets/mkt-1/odds-history"),
    expect.any(Object)
  );
});

// ─── ApiError ────────────────────────────────────────────────────────────────

test("ApiError: has correct name and status", () => {
  const err = new ApiError(422, "Unprocessable");
  expect(err.name).toBe("ApiError");
  expect(err.status).toBe(422);
  expect(err.message).toBe("Unprocessable");
  expect(err).toBeInstanceOf(Error);
});

// ─── fetchUserPositions ───────────────────────────────────────────────────────

test("fetchUserPositions: returns positions array", async () => {
  const position = {
    marketId: "mkt-1",
    side: "FighterA",
    amount: "10000000",
    avgOdds: 1.5,
    open: true,
  };
  global.fetch = mockOk([position]);
  const result = await fetchUserPositions("GADDR1");
  expect(result).toEqual([position]);
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/users/GADDR1/positions"),
    expect.any(Object)
  );
});

// ─── createMarketMeta ─────────────────────────────────────────────────────────

test("createMarketMeta: sends POST request with market metadata", async () => {
  const input = {
    txHash: "tx123",
    fighterAName: "Ali",
    fighterARecord: "20-0",
    fighterANationality: "USA",
    fighterAWeightClass: "HW",
    fighterBName: "Foreman",
    fighterBRecord: "18-2",
    fighterBNationality: "USA",
    fighterBWeightClass: "HW",
    scheduledAt: "2026-07-01T20:00:00Z",
    bettingEndsAt: "2026-07-01T19:00:00Z",
    oracleAddress: "GORACLE",
  };
  global.fetch = mockOk({ success: true, marketId: "mkt-1" });
  const result = await createMarketMeta(input);
  expect(result).toEqual({ success: true, marketId: "mkt-1" });
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/markets"),
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify(input),
    })
  );
});
