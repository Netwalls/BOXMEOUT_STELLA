/**
 * B-136 (#1572): trending ranking, window boundary, limit cap and cache.
 * The database client and Redis are faked.
 */
jest.mock("../../db", () => ({ db: {} }));
jest.mock("../../logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock("../../lib/redis", () => ({ redis: { get: jest.fn(), set: jest.fn() } }));

import { redis } from "../../lib/redis";
import {
  computeTrendingMarkets,
  getTrendingMarkets,
  normaliseTrendingOptions,
  TRENDING_CACHE_TTL_SECONDS,
  TRENDING_MAX_LIMIT,
} from "../trending.service";

const mockedRedis = jest.mocked(redis);
const NOW = new Date("2026-11-20T12:00:00Z");

function fakeClient(ranked: Array<{ marketId: string; windowVolume: string }>, markets: Array<Record<string, unknown> & { id: string }> = []) {
  return {
    $queryRaw: jest.fn().mockResolvedValue(ranked),
    market: { findMany: jest.fn().mockResolvedValue(markets) },
  };
}

describe("normaliseTrendingOptions", () => {
  it("defaults to a 24h window and 10 results", () => {
    expect(normaliseTrendingOptions()).toEqual({ window: "24h", limit: 10 });
  });

  it("caps the limit at 50 and floors it at 1", () => {
    expect(normaliseTrendingOptions({ limit: 500 }).limit).toBe(TRENDING_MAX_LIMIT);
    expect(normaliseTrendingOptions({ limit: 0 }).limit).toBe(1);
  });
});

describe("computeTrendingMarkets", () => {
  it("applies the window boundary: placedAt >= now minus the window", async () => {
    const client = fakeClient([]);
    await computeTrendingMarkets({ window: "1h" }, client as never, NOW);

    const values = client.$queryRaw.mock.calls[0].slice(1);
    expect(values[0]).toEqual(new Date("2026-11-20T11:00:00Z"));
    expect(values[1]).toBe(10);
  });

  it("uses a 7d window when requested", async () => {
    const client = fakeClient([]);
    await computeTrendingMarkets({ window: "7d" }, client as never, NOW);
    expect(client.$queryRaw.mock.calls[0][1]).toEqual(new Date("2026-11-13T12:00:00Z"));
  });

  it("returns markets in rank order with windowVolume as a string", async () => {
    const client = fakeClient(
      [
        { marketId: "m2", windowVolume: "900" },
        { marketId: "m1", windowVolume: "300" },
      ],
      [
        { id: "m1", status: "Open", poolA: 1n },
        { id: "m2", status: "Open", poolA: 2n },
      ],
    );
    const result = await computeTrendingMarkets({}, client as never, NOW);
    expect(result.map((m) => m.id)).toEqual(["m2", "m1"]);
    expect(result[0].windowVolume).toBe("900");
    expect(typeof result[0].windowVolume).toBe("string");
  });

  it("drops ranked ids that the market lookup does not return", async () => {
    const client = fakeClient(
      [
        { marketId: "gone", windowVolume: "500" },
        { marketId: "m1", windowVolume: "100" },
      ],
      [{ id: "m1" }],
    );
    const result = await computeTrendingMarkets({}, client as never, NOW);
    expect(result.map((m) => m.id)).toEqual(["m1"]);
  });

  it("returns an empty list without querying markets when nothing has volume", async () => {
    const client = fakeClient([]);
    expect(await computeTrendingMarkets({}, client as never, NOW)).toEqual([]);
    expect(client.market.findMany).not.toHaveBeenCalled();
  });
});

describe("getTrendingMarkets cache", () => {
  it("returns the cached ranking without querying the database", async () => {
    mockedRedis.get.mockResolvedValue(JSON.stringify([{ id: "c1", windowVolume: "7" }]));
    const client = fakeClient([]);
    const result = await getTrendingMarkets({ window: "1h", limit: 5 }, client as never);
    expect(result).toEqual([{ id: "c1", windowVolume: "7" }]);
    expect(client.$queryRaw).not.toHaveBeenCalled();
    expect(mockedRedis.get).toHaveBeenCalledWith("markets:trending:1h:5");
  });

  it("caches the ranking for 15 seconds, serialising BigInt fields as strings", async () => {
    mockedRedis.get.mockResolvedValue(null);
    mockedRedis.set.mockResolvedValue("OK" as never);
    const client = fakeClient(
      [{ marketId: "m1", windowVolume: "10" }],
      [{ id: "m1", poolA: 42n }],
    );

    await getTrendingMarkets({}, client as never);

    expect(TRENDING_CACHE_TTL_SECONDS).toBe(15);
    expect(mockedRedis.set).toHaveBeenCalledWith(
      "markets:trending:24h:10",
      JSON.stringify([{ id: "m1", poolA: "42", windowVolume: "10" }]),
      "EX",
      15,
    );
  });

  it("still returns results when Redis is unavailable", async () => {
    mockedRedis.get.mockRejectedValue(new Error("down"));
    mockedRedis.set.mockRejectedValue(new Error("down"));
    const client = fakeClient([{ marketId: "m1", windowVolume: "1" }], [{ id: "m1" }]);
    const result = await getTrendingMarkets({}, client as never);
    expect(result.map((m) => m.id)).toEqual(["m1"]);
  });
});
