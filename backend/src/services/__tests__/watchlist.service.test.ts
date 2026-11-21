/**
 * B-134 (#1570): watchlist add/remove rules. The Prisma client is a fake passed
 * in explicitly, so no database is needed.
 */
jest.mock("../../db", () => ({ db: {} }));

import {
  addToWatchlist,
  removeFromWatchlist,
  WatchlistError,
  WATCHLIST_MAX_PER_ADDRESS,
} from "../watchlist.service";

function fakeClient(opts: { market?: boolean; existing?: boolean; count?: number; deleted?: number }) {
  const tx = {
    market: {
      findUnique: jest.fn().mockResolvedValue(opts.market === false ? null : { id: "m1" }),
    },
    watchedMarket: {
      findUnique: jest.fn().mockResolvedValue(opts.existing ? { marketId: "m1" } : null),
      count: jest.fn().mockResolvedValue(opts.count ?? 0),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: opts.deleted ?? 0 }),
    },
  };
  const client = {
    ...tx,
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { client: client as never, tx };
}

describe("addToWatchlist", () => {
  it("creates a watch for a new market under the cap", async () => {
    const { client, tx } = fakeClient({ count: 3 });
    const result = await addToWatchlist("GA", "m1", client);
    expect(result).toEqual({ created: true });
    expect(tx.watchedMarket.create).toHaveBeenCalledWith({ data: { address: "GA", marketId: "m1" } });
  });

  it("is idempotent: an existing watch is not duplicated", async () => {
    const { client, tx } = fakeClient({ existing: true });
    const result = await addToWatchlist("GA", "m1", client);
    expect(result).toEqual({ created: false });
    expect(tx.watchedMarket.create).not.toHaveBeenCalled();
  });

  it("rejects the add that would exceed the cap", async () => {
    const { client, tx } = fakeClient({ count: WATCHLIST_MAX_PER_ADDRESS });
    await expect(addToWatchlist("GA", "m1", client)).rejects.toMatchObject({
      code: "WATCHLIST_LIMIT_REACHED",
    });
    expect(tx.watchedMarket.create).not.toHaveBeenCalled();
  });

  it("allows the last slot below the cap", async () => {
    const { client } = fakeClient({ count: WATCHLIST_MAX_PER_ADDRESS - 1 });
    await expect(addToWatchlist("GA", "m1", client)).resolves.toEqual({ created: true });
  });

  it("does not count the cap for an already-watched market", async () => {
    const { client } = fakeClient({ existing: true, count: WATCHLIST_MAX_PER_ADDRESS });
    await expect(addToWatchlist("GA", "m1", client)).resolves.toEqual({ created: false });
  });

  it("returns MARKET_NOT_FOUND for an unknown market", async () => {
    const { client } = fakeClient({ market: false });
    const err = await addToWatchlist("GA", "missing", client).catch((e) => e);
    expect(err).toBeInstanceOf(WatchlistError);
    expect(err.code).toBe("MARKET_NOT_FOUND");
  });
});

describe("removeFromWatchlist", () => {
  it("deletes only the owner's row for that market", async () => {
    const { client, tx } = fakeClient({ deleted: 1 });
    const count = await removeFromWatchlist("GA", "m1", client);
    expect(tx.watchedMarket.deleteMany).toHaveBeenCalledWith({
      where: { address: "GA", marketId: "m1" },
    });
    expect(count).toBe(1);
  });

  it("returns 0 when the market was not watched", async () => {
    const { client } = fakeClient({ deleted: 0 });
    expect(await removeFromWatchlist("GA", "m1", client)).toBe(0);
  });
});
