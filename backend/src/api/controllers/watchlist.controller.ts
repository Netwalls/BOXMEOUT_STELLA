import type { Request, Response } from "express";
import { z } from "zod";
import { logger } from "../../logger";
import * as watchlistService from "../../services/watchlist.service";
import { WatchlistError } from "../../services/watchlist.service";
import { ok, fail } from "../response";

const marketIdSchema = z.string().min(1).max(128);

/** GET /api/users/:address/watchlist */
export async function getWatchlistHandler(req: Request, res: Response): Promise<void> {
  try {
    const rows = await watchlistService.listWatchlist(req.params.address);
    ok(res, rows.map((row) => ({ marketId: row.marketId, createdAt: row.createdAt })));
  } catch (err) {
    logger.error({ err }, "Failed to load watchlist");
    fail(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
}

/** PUT /api/users/:address/watchlist/:marketId — idempotent */
export async function putWatchlistHandler(req: Request, res: Response): Promise<void> {
  const parsed = marketIdSchema.safeParse(req.params.marketId);
  if (!parsed.success) {
    fail(res, 400, "VALIDATION_ERROR", "Invalid market id");
    return;
  }

  try {
    const result = await watchlistService.addToWatchlist(req.params.address, parsed.data);
    ok(res, { marketId: parsed.data, watched: true, created: result.created });
  } catch (err) {
    if (err instanceof WatchlistError) {
      if (err.code === "MARKET_NOT_FOUND") {
        fail(res, 404, "NOT_FOUND", err.message);
      } else {
        fail(res, 422, err.code, err.message);
      }
      return;
    }
    logger.error({ err }, "Failed to add to watchlist");
    fail(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
}

/** DELETE /api/users/:address/watchlist/:marketId — idempotent */
export async function deleteWatchlistHandler(req: Request, res: Response): Promise<void> {
  const parsed = marketIdSchema.safeParse(req.params.marketId);
  if (!parsed.success) {
    fail(res, 400, "VALIDATION_ERROR", "Invalid market id");
    return;
  }

  try {
    const removed = await watchlistService.removeFromWatchlist(req.params.address, parsed.data);
    ok(res, { marketId: parsed.data, removed: removed > 0 });
  } catch (err) {
    logger.error({ err }, "Failed to remove from watchlist");
    fail(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
}
