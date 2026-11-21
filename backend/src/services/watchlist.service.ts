/**
 * B-134 (#1570): per-wallet market watchlist.
 *
 * Rows are keyed by (address, marketId). PUT is idempotent: adding an existing
 * watch returns `created: false` and does not change the row. Each address is
 * capped at WATCHLIST_MAX_PER_ADDRESS entries. Deleting a market removes its
 * watch rows through the database cascade.
 *
 * The cap check and the insert run in one transaction. Two concurrent PUTs from
 * the same wallet at the cap can both pass the count, so the cap is a soft limit
 * under heavy concurrency; it is not a hard database constraint.
 */
import { PrismaClient } from "@prisma/client";
import { db } from "../db";

export const WATCHLIST_MAX_PER_ADDRESS = 200;

export class WatchlistError extends Error {
  constructor(
    public readonly code: "WATCHLIST_LIMIT_REACHED" | "MARKET_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "WatchlistError";
  }
}

export async function listWatchlist(address: string, client: PrismaClient = db) {
  return client.watchedMarket.findMany({
    where: { address },
    orderBy: [{ createdAt: "desc" }, { marketId: "asc" }],
    select: { marketId: true, createdAt: true },
  });
}

/**
 * Adds `marketId` to the wallet's watchlist. Returns whether a new row was created.
 * Throws WatchlistError when the market does not exist or the cap is reached.
 */
export async function addToWatchlist(
  address: string,
  marketId: string,
  client: PrismaClient = db,
): Promise<{ created: boolean }> {
  return client.$transaction(async (tx) => {
    const market = await tx.market.findUnique({ where: { id: marketId }, select: { id: true } });
    if (!market) {
      throw new WatchlistError("MARKET_NOT_FOUND", "Market not found");
    }

    const existing = await tx.watchedMarket.findUnique({
      where: { address_marketId: { address, marketId } },
      select: { marketId: true },
    });
    if (existing) {
      return { created: false };
    }

    const count = await tx.watchedMarket.count({ where: { address } });
    if (count >= WATCHLIST_MAX_PER_ADDRESS) {
      throw new WatchlistError(
        "WATCHLIST_LIMIT_REACHED",
        `Watchlist is limited to ${WATCHLIST_MAX_PER_ADDRESS} markets`,
      );
    }

    await tx.watchedMarket.create({ data: { address, marketId } });
    return { created: true };
  });
}

/** Removes a watch. Returns the number of rows deleted (0 if it was not watched). */
export async function removeFromWatchlist(
  address: string,
  marketId: string,
  client: PrismaClient = db,
): Promise<number> {
  const result = await client.watchedMarket.deleteMany({ where: { address, marketId } });
  return result.count;
}
