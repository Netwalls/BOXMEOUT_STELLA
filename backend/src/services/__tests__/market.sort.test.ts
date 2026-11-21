/**
 * B-122 (#1558): sort whitelist, deterministic tie-break and category filter
 * for the market list query.
 */
import { buildMarketOrderBy } from "../market-sort";
import { getAllMarkets } from "../market-list.service";
import { db } from "../../db";
import { redis } from "../../lib/redis";

jest.mock("../../db", () => ({
  db: {
    market: { findMany: jest.fn(), count: jest.fn() },
  },
}));
jest.mock("../../lib/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn() },
}));
jest.mock("../../logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockDb = db as unknown as {
  market: { findMany: jest.Mock; count: jest.Mock };
};
const mockRedis = redis as unknown as { get: jest.Mock; set: jest.Mock };

describe("buildMarketOrderBy", () => {
  it.each([
    ["soonest", "scheduledAt"],
    ["newest", "createdAt"],
    ["pool", "totalPool"],
  ] as const)("sorts %s by %s", (sort, field) => {
    expect(buildMarketOrderBy(sort, "desc")).toEqual([
      { [field]: "desc" },
      { id: "desc" },
    ]);
  });

  it("defaults to soonest ascending", () => {
    expect(buildMarketOrderBy()).toEqual([
      { scheduledAt: "asc" },
      { id: "asc" },
    ]);
  });
});

describe("getAllMarkets", () => {
  beforeEach(() => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue("OK");
    mockDb.market.findMany.mockResolvedValue([]);
    mockDb.market.count.mockResolvedValue(0);
  });

  it("applies the category filter and the requested sort", async () => {
    await getAllMarkets(
      { categoryId: "cat-1" },
      { page: 2, pageSize: 10 },
      "pool",
      "desc"
    );

    expect(mockDb.market.findMany).toHaveBeenCalledWith({
      where: { categoryId: "cat-1" },
      orderBy: [{ totalPool: "desc" }, { id: "desc" }],
      skip: 10,
      take: 10,
    });
    expect(mockDb.market.count).toHaveBeenCalledWith({
      where: { categoryId: "cat-1" },
    });
  });

  it("keeps the soonest ascending default when no sort is given", async () => {
    await getAllMarkets();

    expect(mockDb.market.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
      })
    );
  });

  it("includes sort, order and category in the cache key", async () => {
    await getAllMarkets({ categoryId: "cat-1" }, { page: 1, pageSize: 20 }, "newest", "asc");
    await getAllMarkets({ categoryId: "cat-1" }, { page: 1, pageSize: 20 }, "pool", "asc");

    const keys = mockRedis.set.mock.calls.map((c) => c[0]);
    expect(keys[0]).not.toEqual(keys[1]);
    expect(keys[0]).toContain("cat-1");
    expect(keys[0]).toContain("newest");
  });
});
