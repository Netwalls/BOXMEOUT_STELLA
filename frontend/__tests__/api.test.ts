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
  ApiResponseError,
  Market,
  Bet,
  MarketStats,
  OddsSnapshot,
  PortfolioSummary,
} from "@/lib/api";

// Response bodies below follow the envelope the backend controllers send:
// `{ data, page, limit }` for lists and `{ data }` for single values.

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

function mockJson(body: unknown, status = 200) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function mockError(status: number, message = "Server error") {
  return jest.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ error: message }),
    text: () => Promise.resolve(message),
  });
}

afterEach(() => jest.restoreAllMocks());

// ─── envelope handling ────────────────────────────────────────────────────────

test("fetchMarkets: unwraps data and exposes pagination metadata", async () => {
  global.fetch = mockJson({ data: [MARKET], page: 2, limit: 10 });

  const result = await fetchMarkets({ page: 2, limit: 10 });

  expect(result.data).toEqual([MARKET]);
  expect(result.page).toBe(2);
  expect(result.limit).toBe(10);
});

test("fetchMarkets: exposes nextCursor for cursor-paginated responses", async () => {
  global.fetch = mockJson({ data: [MARKET], nextCursor: "abc", limit: 20 });

  const result = await fetchMarkets();

  expect(result.nextCursor).toBe("abc");
  expect(result.page).toBeUndefined();
});

test("fetchMarketById: unwraps a single-value envelope", async () => {
  global.fetch = mockJson({ data: MARKET });
  await expect(fetchMarketById("mkt-1")).resolves.toEqual(MARKET);
});

test("a body without an envelope is validated as-is", async () => {
  global.fetch = mockJson(MARKET);
  await expect(fetchMarketById("mkt-1")).resolves.toEqual(MARKET);
});

test("throws ApiResponseError when the payload does not match the schema", async () => {
  global.fetch = mockJson({ data: { ...MARKET, poolA: 1000 } });

  const err = await fetchMarketById("mkt-1").catch((e) => e);

  expect(err).toBeInstanceOf(ApiResponseError);
  expect(err.message).toContain("poolA");
});

test("rejects BigInt fields that are not decimal strings", async () => {
  global.fetch = mockJson({ data: { ...MARKET, totalPool: "1.5e9" } });
  await expect(fetchMarketById("mkt-1")).rejects.toBeInstanceOf(ApiResponseError);
});

// ─── fetchMarkets ─────────────────────────────────────────────────────────────

test("fetchMarkets: requests the market list", async () => {
  global.fetch = mockJson({ data: [MARKET] });
  await fetchMarkets();
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/markets"),
    expect.any(Object)
  );
});

test("fetchMarkets: passes query params", async () => {
  global.fetch = mockJson({ data: [MARKET] });
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
  global.fetch = mockJson({ data: MARKET });
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
  global.fetch = mockJson({ data: STATS });
  const result = await fetchMarketStats("mkt-1");
  expect(result).toEqual(STATS);
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/markets/mkt-1/stats"),
    expect.any(Object)
  );
});

// ─── fetchMarketBets ──────────────────────────────────────────────────────────

test("fetchMarketBets: returns bets array", async () => {
  global.fetch = mockJson({ data: [BET], page: 1, limit: 20 });
  const result = await fetchMarketBets("mkt-1");
  expect(result).toEqual([BET]);
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/markets/mkt-1/bets"),
    expect.any(Object)
  );
});

test("fetchMarketBets: passes outcome filter query param", async () => {
  global.fetch = mockJson({ data: [BET] });
  await fetchMarketBets("mkt-1", { outcome: "FighterA" });
  const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
  expect(url).toContain("outcome=FighterA");
});

// ─── fetchBetsByAddress ───────────────────────────────────────────────────────

test("fetchBetsByAddress: returns bets for address", async () => {
  global.fetch = mockJson({ data: [BET] });
  const result = await fetchBetsByAddress("GADDR1");
  expect(result).toEqual([BET]);
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/bets/GADDR1"),
    expect.any(Object)
  );
});

// ─── fetchPortfolioSummary ────────────────────────────────────────────────────

test("fetchPortfolioSummary: returns summary", async () => {
  global.fetch = mockJson({ data: SUMMARY });
  const result = await fetchPortfolioSummary("GADDR1");
  expect(result).toEqual(SUMMARY);
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/bets/GADDR1/portfolio"),
    expect.any(Object)
  );
});

// ─── fetchPayoutEstimate ──────────────────────────────────────────────────────

test("fetchPayoutEstimate: reads estimatedPayout and returns a BigInt", async () => {
  global.fetch = mockJson({ data: { estimatedPayout: "150000000" } });
  const result = await fetchPayoutEstimate("mkt-1", "FighterA", BigInt(100000000));
  expect(result).toBe(BigInt(150000000));
  expect(typeof result).toBe("bigint");
});

test("fetchPayoutEstimate: passes correct query params", async () => {
  global.fetch = mockJson({ data: { estimatedPayout: "0" } });
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
  global.fetch = mockJson({ data: [SNAPSHOT] });
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
  global.fetch = mockJson({ data: [position] });
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
  global.fetch = mockJson({ data: { success: true, marketId: "mkt-1" } });
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
