/**
 * B-135 (#1571): platform totals. The database client and Redis are faked, so
 * the aggregate mapping and the cache behaviour are tested without infrastructure.
 */
jest.mock("../../db", () => ({ db: {} }));
jest.mock("../../logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock("../../lib/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn() },
}));

import { redis } from "../../lib/redis";
import {
  computePlatformStats,
  getPlatformStats,
  STATS_CACHE_KEY,
  STATS_CACHE_TTL_SECONDS,
} from "../stats.service";

const mockedRedis = jest.mocked(redis);

function fakeDb(overrides: {
  totalPool?: bigint | null;
  markets?: number;
  open?: number;
  payout?: bigint | null;
  bettors?: number;
} = {}) {
  const client = {
    market: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { totalPool: overrides.totalPool === undefined ? 5_000n : overrides.totalPool },
        _count: { _all: overrides.markets ?? 7 },
      }),
      count: jest.fn().mockResolvedValue(overrides.open ?? 2),
    },
    bet: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { payout: overrides.payout === undefined ? 1_200n : overrides.payout },
      }),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ count: overrides.bettors ?? 4 }]),
  };
  return client;
}

describe("computePlatformStats", () => {
  it("returns BigInt totals as strings and counts as numbers", async () => {
    const stats = await computePlatformStats(fakeDb() as never);
    expect(stats).toEqual({
      totalVolume: "5000",
      totalPaidOut: "1200",
      totalMarkets: 7,
      openMarkets: 2,
      uniqueBettors: 4,
    });
  });

  it("reports zero when there are no bets or markets", async () => {
    const stats = await computePlatformStats(
      fakeDb({ totalPool: null, payout: null, markets: 0, open: 0, bettors: 0 }) as never,
    );
    expect(stats).toEqual({
      totalVolume: "0",
      totalPaidOut: "0",
      totalMarkets: 0,
      openMarkets: 0,
      uniqueBettors: 0,
    });
  });

  it("counts only Open markets for openMarkets", async () => {
    const client = fakeDb();
    await computePlatformStats(client as never);
    expect(client.market.count).toHaveBeenCalledWith({ where: { status: "Open" } });
  });
});

describe("getPlatformStats caching", () => {
  it("returns the cached value without querying the database", async () => {
    const cached = { totalVolume: "9", totalPaidOut: "1", totalMarkets: 1, openMarkets: 1, uniqueBettors: 1 };
    mockedRedis.get.mockResolvedValue(JSON.stringify(cached));
    const client = fakeDb();

    const stats = await getPlatformStats(client as never);

    expect(stats).toEqual(cached);
    expect(client.market.aggregate).not.toHaveBeenCalled();
  });

  it("computes and caches for STATS_CACHE_TTL_SECONDS on a miss", async () => {
    mockedRedis.get.mockResolvedValue(null);
    mockedRedis.set.mockResolvedValue("OK" as never);
    const client = fakeDb();

    const stats = await getPlatformStats(client as never);

    expect(stats.totalVolume).toBe("5000");
    expect(mockedRedis.set).toHaveBeenCalledWith(
      STATS_CACHE_KEY,
      JSON.stringify(stats),
      "EX",
      STATS_CACHE_TTL_SECONDS,
    );
    expect(STATS_CACHE_TTL_SECONDS).toBe(30);
  });

  it("falls back to the database when Redis read fails", async () => {
    mockedRedis.get.mockRejectedValue(new Error("redis down"));
    mockedRedis.set.mockRejectedValue(new Error("redis down"));
    const stats = await getPlatformStats(fakeDb() as never);
    expect(stats.totalMarkets).toBe(7);
  });
});
