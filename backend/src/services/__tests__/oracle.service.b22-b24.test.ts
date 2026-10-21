/**
 * Unit tests for B-22 / #1080 — verifyOracleAuthorization
 *          and B-24 / #1082 — pollExternalResultFeeds
 *
 * All external dependencies (PrismaClient, logger, Stellar SDK) are fully
 * mocked, so no real database or network connections are required.
 */

// ── Mock logger ────────────────────────────────────────────────────────────
jest.mock("../../logger", () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// ── Mock bullmq so module load does not open Redis connections ────────────
jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({ getJob: jest.fn(), add: jest.fn() })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
}));

// ── Mock @stellar/stellar-sdk to avoid loading the heavy SDK ──────────────
jest.mock("@stellar/stellar-sdk", () => ({
  SorobanRpc: { Server: jest.fn() },
  TransactionBuilder: jest.fn(),
  Networks: { PUBLIC: "Public Global Stellar Network ; September 2015", TESTNET: "Test SDF Network ; September 2015" },
  Contract: jest.fn(),
  Keypair: { fromSecret: jest.fn() },
  BASE_FEE: "100",
  nativeToScVal: jest.fn(),
  xdr: { ScVal: { scvSymbol: jest.fn() } },
}));

// ── PrismaClient mocks ─────────────────────────────────────────────────────
// We keep individual jest.fn() references so each test can configure them.
const mockMarketFindUnique = jest.fn();
const mockMarketFindMany = jest.fn();
const mockOracleFindFirst = jest.fn();
const mockOracleResultFindUnique = jest.fn();
const mockOracleResultCreate = jest.fn();

jest.mock("@prisma/client", () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      market: {
        findUnique: mockMarketFindUnique,
        findMany: mockMarketFindMany,
      },
      oracle: {
        findFirst: mockOracleFindFirst,
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      oracleResult: {
        findUnique: mockOracleResultFindUnique,
        create: mockOracleResultCreate,
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      dispute: { create: jest.fn() },
      adminLog: { create: jest.fn() },
      $transaction: jest.fn(),
      // db.ts subscribes to Prisma events and wraps the client in $extends (B-100, B-102)
      $on: jest.fn(),
      $extends: jest.fn().mockReturnThis(),
    })),
    // Re-export enums / types the module-under-test imports at the type level
    Prisma: {},
  };
});

// ── Import after mocks are registered ─────────────────────────────────────
import {
  verifyOracleAuthorization,
  OracleAuthorizationError,
  pollExternalResultFeeds,
  FeedSource,
  CandidateResolution,
  ExternalFightResult,
} from "../oracle.service";
import { PrismaClient } from "@prisma/client";
import { logger } from "../../logger";

// ── Helpers ────────────────────────────────────────────────────────────────

function makePrisma(): PrismaClient {
  return new PrismaClient();
}

function makeExternalResult(
  overrides: Partial<ExternalFightResult> = {},
): ExternalFightResult {
  return {
    matchId: "match-001",
    winner: "FighterA",
    method: "KO",
    round: 3,
    source: "https://api.boxrec.com",
    reportedAt: new Date("2026-07-10T22:00:00Z"),
    ...overrides,
  };
}

function makeMarket(overrides: Record<string, unknown> = {}) {
  return {
    id: "market-abc",
    contractAddress: "CCONTRACT1",
    oracleAddress: "GORACLE1",
    status: "Locked",
    scheduledAt: new Date("2026-07-10T20:00:00Z"),
    fighterA: { name: "Fighter A" },
    fighterB: { name: "Fighter B" },
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// B-22 / #1080 — verifyOracleAuthorization
// ══════════════════════════════════════════════════════════════════════════════

describe("B-22 / #1080 — verifyOracleAuthorization", () => {
  let db: PrismaClient;

  beforeEach(() => {
    jest.clearAllMocks();
    db = makePrisma();
  });

  // ── Happy paths ────────────────────────────────────────────────────────

  it("resolves without error when submitter matches the market oracleAddress", async () => {
    mockMarketFindUnique.mockResolvedValueOnce(
      makeMarket({ oracleAddress: "GORACLE1" }),
    );

    await expect(
      verifyOracleAuthorization("market-abc", "GORACLE1", db),
    ).resolves.toBeUndefined();
  });

  it("resolves without error when submitter is a globally registered active oracle", async () => {
    // Market has a DIFFERENT oracleAddress, but submitter is in the Oracle table.
    mockMarketFindUnique.mockResolvedValueOnce(
      makeMarket({ oracleAddress: "GORACLE_SPECIFIC" }),
    );
    mockOracleFindFirst.mockResolvedValueOnce({
      id: "oid-1",
      address: "GORACLE_GLOBAL",
      active: true,
    });

    await expect(
      verifyOracleAuthorization("market-abc", "GORACLE_GLOBAL", db),
    ).resolves.toBeUndefined();
  });

  // ── Mismatch / rejection ───────────────────────────────────────────────

  it("throws OracleAuthorizationError when submitter does not match and is not registered", async () => {
    mockMarketFindUnique.mockResolvedValueOnce(
      makeMarket({ oracleAddress: "GORACLE_CORRECT" }),
    );
    // No registered oracle for the bad submitter
    mockOracleFindFirst.mockResolvedValueOnce(null);

    await expect(
      verifyOracleAuthorization("market-abc", "GORACLE_WRONG", db),
    ).rejects.toThrow(OracleAuthorizationError);
  });

  it("OracleAuthorizationError carries expected, actual, and marketId", async () => {
    mockMarketFindUnique.mockResolvedValueOnce(
      makeMarket({ oracleAddress: "GORACLE_CORRECT" }),
    );
    mockOracleFindFirst.mockResolvedValueOnce(null);

    let caught: OracleAuthorizationError | undefined;
    try {
      await verifyOracleAuthorization("market-abc", "GORACLE_WRONG", db);
    } catch (err) {
      caught = err as OracleAuthorizationError;
    }

    expect(caught).toBeDefined();
    expect(caught!.name).toBe("OracleAuthorizationError");
    expect(caught!.marketId).toBe("market-abc");
    expect(caught!.expected).toBe("GORACLE_CORRECT");
    expect(caught!.actual).toBe("GORACLE_WRONG");
    expect(caught!.message).toMatch("GORACLE_CORRECT");
    expect(caught!.message).toMatch("GORACLE_WRONG");
  });

  it("throws OracleAuthorizationError even when a registered-but-inactive oracle tries to submit", async () => {
    mockMarketFindUnique.mockResolvedValueOnce(
      makeMarket({ oracleAddress: "GORACLE_CORRECT" }),
    );
    // findFirst filters by active: true, so an inactive oracle returns null
    mockOracleFindFirst.mockResolvedValueOnce(null);

    await expect(
      verifyOracleAuthorization("market-abc", "GORACLE_INACTIVE", db),
    ).rejects.toThrow(OracleAuthorizationError);
  });

  // ── Not-found path ─────────────────────────────────────────────────────

  it("throws a plain Error when the market does not exist", async () => {
    mockMarketFindUnique.mockResolvedValueOnce(null);

    await expect(
      verifyOracleAuthorization("no-such-market", "GORACLE1", db),
    ).rejects.toThrow("Market not found: no-such-market");
  });

  it("does NOT call oracle.findFirst when market oracleAddress already matches", async () => {
    mockMarketFindUnique.mockResolvedValueOnce(
      makeMarket({ oracleAddress: "GORACLE1" }),
    );

    await verifyOracleAuthorization("market-abc", "GORACLE1", db);

    expect(mockOracleFindFirst).not.toHaveBeenCalled();
  });

  // ── Dependency injection ───────────────────────────────────────────────

  it("uses the injected db instead of the module-level prisma instance", async () => {
    mockMarketFindUnique.mockResolvedValueOnce(
      makeMarket({ oracleAddress: "GORACLE1" }),
    );

    await verifyOracleAuthorization("market-abc", "GORACLE1", db);

    // The injected db.market.findUnique was called, not any module-level instance.
    expect(mockMarketFindUnique).toHaveBeenCalledWith({
      where: { id: "market-abc" },
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// B-24 / #1082 — pollExternalResultFeeds
// ══════════════════════════════════════════════════════════════════════════════

describe("B-24 / #1082 — pollExternalResultFeeds", () => {
  let db: PrismaClient;

  beforeEach(() => {
    jest.clearAllMocks();
    db = makePrisma();
  });

  // ── Helper: build a minimal feed ────────────────────────────────────────
  function makeFeed(
    name: string,
    result: ExternalFightResult | null,
  ): FeedSource {
    return { name, fetch: jest.fn().mockResolvedValue(result) };
  }

  // ── Happy path: single result queued ────────────────────────────────────

  it("creates an unconfirmed OracleResult when a feed returns a result", async () => {
    const market = makeMarket();
    mockMarketFindMany.mockResolvedValueOnce([market]);
    mockOracleResultFindUnique.mockResolvedValueOnce(null); // no existing candidate
    mockOracleResultCreate.mockResolvedValueOnce({
      id: "oresult-1",
      marketId: market.id,
      confirmed: false,
    });

    const feed = makeFeed("BoxRec", makeExternalResult());
    const result = await pollExternalResultFeeds({ feeds: [feed], db });

    expect(result).toHaveLength(1);
    expect(result[0].marketId).toBe(market.id);
    expect(result[0].oracleResultId).toBe("oresult-1");
  });

  it("always creates OracleResult with confirmed = false (never auto-confirms)", async () => {
    const market = makeMarket();
    mockMarketFindMany.mockResolvedValueOnce([market]);
    mockOracleResultFindUnique.mockResolvedValueOnce(null);
    mockOracleResultCreate.mockResolvedValueOnce({
      id: "oresult-2",
      marketId: market.id,
      confirmed: false,
    });

    const feed = makeFeed("ESPN", makeExternalResult({ winner: "FighterB" }));
    await pollExternalResultFeeds({ feeds: [feed], db });

    expect(mockOracleResultCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ confirmed: false }),
      }),
    );
  });

  it("maps winner correctly to DB Outcome enum value", async () => {
    const market = makeMarket();
    mockMarketFindMany.mockResolvedValueOnce([market]);
    mockOracleResultFindUnique.mockResolvedValueOnce(null);
    mockOracleResultCreate.mockResolvedValueOnce({ id: "oresult-3", marketId: market.id, confirmed: false });

    const feed = makeFeed("BoxRec", makeExternalResult({ winner: "Draw" }));
    await pollExternalResultFeeds({ feeds: [feed], db });

    expect(mockOracleResultCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ outcome: "Draw" }),
      }),
    );
  });

  // ── No result available ───────────────────────────────────────────────────

  it("returns an empty array when no feed has a result", async () => {
    mockMarketFindMany.mockResolvedValueOnce([makeMarket()]);
    mockOracleResultFindUnique.mockResolvedValueOnce(null);

    const feed = makeFeed("BoxRec", null);
    const result = await pollExternalResultFeeds({ feeds: [feed], db });

    expect(result).toHaveLength(0);
    expect(mockOracleResultCreate).not.toHaveBeenCalled();
  });

  it("returns an empty array when there are no Locked markets", async () => {
    mockMarketFindMany.mockResolvedValueOnce([]);

    const feed = makeFeed("BoxRec", makeExternalResult());
    const result = await pollExternalResultFeeds({ feeds: [feed], db });

    expect(result).toHaveLength(0);
    expect(mockOracleResultCreate).not.toHaveBeenCalled();
    expect(feed.fetch).not.toHaveBeenCalled();
  });

  // ── Skip markets with existing unconfirmed candidate ────────────────────

  it("skips markets that already have an unconfirmed OracleResult row", async () => {
    const market = makeMarket();
    mockMarketFindMany.mockResolvedValueOnce([market]);
    // An unconfirmed candidate already exists
    mockOracleResultFindUnique.mockResolvedValueOnce({
      id: "existing-oresult",
      marketId: market.id,
      confirmed: false,
    });

    const feed = makeFeed("BoxRec", makeExternalResult());
    const result = await pollExternalResultFeeds({ feeds: [feed], db });

    expect(result).toHaveLength(0);
    expect(feed.fetch).not.toHaveBeenCalled();
    expect(mockOracleResultCreate).not.toHaveBeenCalled();
  });

  // ── Source + confidence logged ────────────────────────────────────────────

  it("logs source and confidence for every queued candidate", async () => {
    const market = makeMarket();
    mockMarketFindMany.mockResolvedValueOnce([market]);
    mockOracleResultFindUnique.mockResolvedValueOnce(null);
    mockOracleResultCreate.mockResolvedValueOnce({ id: "oresult-4", marketId: market.id, confirmed: false });

    const externalResult = makeExternalResult({ source: "https://api.boxrec.com" });
    const feed = makeFeed("BoxRec", externalResult);
    await pollExternalResultFeeds({ feeds: [feed], db });

    const loggerInfo = logger.info as jest.Mock;
    // Find the call that logs the candidate resolution
    const candidateLog = loggerInfo.mock.calls.find(
      ([meta]: [Record<string, unknown>]) => meta && meta.oracleResultId === "oresult-4",
    );
    expect(candidateLog).toBeDefined();
    const [meta] = candidateLog;
    expect(meta.source).toBe("https://api.boxrec.com");
    expect(typeof meta.confidence).toBe("number");
    expect(meta.confidence).toBeGreaterThan(0);
    expect(meta.confidence).toBeLessThanOrEqual(1);
  });

  it("logs each feed query result (source + found flag)", async () => {
    const market = makeMarket();
    mockMarketFindMany.mockResolvedValueOnce([market]);
    mockOracleResultFindUnique.mockResolvedValueOnce(null);
    mockOracleResultCreate.mockResolvedValueOnce({ id: "oresult-5", marketId: market.id, confirmed: false });

    const feed = makeFeed("BoxRec", makeExternalResult());
    await pollExternalResultFeeds({ feeds: [feed], db });

    const loggerInfo = logger.info as jest.Mock;
    const feedQueryLog = loggerInfo.mock.calls.find(
      ([meta]: [Record<string, unknown>]) => meta && meta.source === "BoxRec",
    );
    expect(feedQueryLog).toBeDefined();
    expect(feedQueryLog[0].found).toBe(true);
  });

  // ── Multiple markets ────────────────────────────────────────────────────

  it("queues one candidate per market when multiple markets are pending", async () => {
    const markets = [
      makeMarket({ id: "market-1" }),
      makeMarket({ id: "market-2" }),
    ];
    mockMarketFindMany.mockResolvedValueOnce(markets);

    // Both markets have no existing candidate
    mockOracleResultFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    mockOracleResultCreate
      .mockResolvedValueOnce({ id: "oresult-m1", marketId: "market-1", confirmed: false })
      .mockResolvedValueOnce({ id: "oresult-m2", marketId: "market-2", confirmed: false });

    const feed: FeedSource = {
      name: "BoxRec",
      fetch: jest.fn().mockResolvedValue(makeExternalResult()),
    };

    const results = await pollExternalResultFeeds({ feeds: [feed], db });

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.marketId)).toEqual(["market-1", "market-2"]);
  });

  // ── Feed errors handled gracefully ───────────────────────────────────────

  it("continues processing other feeds when one feed throws", async () => {
    const market = makeMarket();
    mockMarketFindMany.mockResolvedValueOnce([market]);
    mockOracleResultFindUnique.mockResolvedValueOnce(null);
    mockOracleResultCreate.mockResolvedValueOnce({ id: "oresult-6", marketId: market.id, confirmed: false });

    const failingFeed: FeedSource = {
      name: "FailSource",
      fetch: jest.fn().mockRejectedValue(new Error("Network timeout")),
    };
    const workingFeed: FeedSource = {
      name: "WorkingSource",
      fetch: jest.fn().mockResolvedValue(makeExternalResult()),
    };

    const results = await pollExternalResultFeeds({
      feeds: [failingFeed, workingFeed],
      db,
    });

    expect(results).toHaveLength(1);
    expect(results[0].oracleResultId).toBe("oresult-6");

    // Error logged for the failing feed
    const loggerError = logger.error as jest.Mock;
    const errorLog = loggerError.mock.calls.find(
      ([meta]: [Record<string, unknown>]) => meta && String(meta.error).includes("Network timeout"),
    );
    expect(errorLog).toBeDefined();
  });

  it("returns empty array and logs error when ALL feeds throw", async () => {
    const market = makeMarket();
    mockMarketFindMany.mockResolvedValueOnce([market]);
    mockOracleResultFindUnique.mockResolvedValueOnce(null);

    const feed: FeedSource = {
      name: "FailSource",
      fetch: jest.fn().mockRejectedValue(new Error("Service unavailable")),
    };

    const results = await pollExternalResultFeeds({ feeds: [feed], db });

    expect(results).toHaveLength(0);
    expect(mockOracleResultCreate).not.toHaveBeenCalled();
  });

  // ── Confidence score calculation ─────────────────────────────────────────

  it("reports confidence of 1.0 when all sources agree", async () => {
    const market = makeMarket();
    mockMarketFindMany.mockResolvedValueOnce([market]);
    mockOracleResultFindUnique.mockResolvedValueOnce(null);
    mockOracleResultCreate.mockResolvedValueOnce({ id: "oresult-7", marketId: market.id, confirmed: false });

    const feedA = makeFeed("BoxRec", makeExternalResult({ winner: "FighterA" }));
    const feedB = makeFeed("ESPN", makeExternalResult({ winner: "FighterA" }));

    const results = await pollExternalResultFeeds({
      feeds: [feedA, feedB],
      db,
    });

    expect(results[0].confidence).toBe(1);
  });

  it("reports confidence of 0.5 when only one of two feeds returns a result", async () => {
    const market = makeMarket();
    mockMarketFindMany.mockResolvedValueOnce([market]);
    mockOracleResultFindUnique.mockResolvedValueOnce(null);
    mockOracleResultCreate.mockResolvedValueOnce({ id: "oresult-8", marketId: market.id, confirmed: false });

    const feedA = makeFeed("BoxRec", makeExternalResult({ winner: "FighterA" }));
    const feedB = makeFeed("ESPN", null); // no result

    const results = await pollExternalResultFeeds({
      feeds: [feedA, feedB],
      db,
    });

    expect(results[0].confidence).toBe(0.5);
  });

  // ── Dependency injection ──────────────────────────────────────────────────

  it("uses the injected db for all DB calls", async () => {
    mockMarketFindMany.mockResolvedValueOnce([]);

    await pollExternalResultFeeds({ feeds: [], db });

    expect(mockMarketFindMany).toHaveBeenCalled();
  });

  it("CandidateResolution contains marketId, oracleResultId, source, confidence, result", async () => {
    const market = makeMarket({ id: "market-xyz" });
    mockMarketFindMany.mockResolvedValueOnce([market]);
    mockOracleResultFindUnique.mockResolvedValueOnce(null);
    mockOracleResultCreate.mockResolvedValueOnce({
      id: "oresult-xyz",
      marketId: "market-xyz",
      confirmed: false,
    });

    const externalResult = makeExternalResult({
      source: "https://api.boxrec.com",
      winner: "FighterB",
    });
    const feed = makeFeed("BoxRec", externalResult);
    const results = await pollExternalResultFeeds({ feeds: [feed], db });

    const candidate: CandidateResolution = results[0];
    expect(candidate.marketId).toBe("market-xyz");
    expect(candidate.oracleResultId).toBe("oresult-xyz");
    expect(candidate.source).toBe("https://api.boxrec.com");
    expect(candidate.confidence).toBe(1);
    expect(candidate.result).toEqual(externalResult);
  });
});
