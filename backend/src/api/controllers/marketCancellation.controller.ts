import type { NextFunction, Request, Response } from "express";
import { db } from "../../db";
import * as oracleService from "../../services/oracle.service";
import { ok, fail } from "../response";

/**
 * B-137: POST /api/admin/markets/cancel
 * Body: { marketId: string, reason: string }
 *
 * Only Open or Locked markets can be cancelled (409 otherwise). The on-chain
 * call is queued; the database status changes when the indexer sees the event.
 */
export async function cancelMarketHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { marketId, reason } = req.body ?? {};

    if (typeof marketId !== "string" || marketId.trim() === "") {
      fail(res, 400, "VALIDATION_ERROR", "marketId is required");
      return;
    }
    if (typeof reason !== "string" || reason.trim() === "") {
      fail(res, 400, "VALIDATION_ERROR", "reason is required");
      return;
    }

    const market = await db.market.findUnique({
      where: { id: marketId },
      select: { id: true, status: true },
    });

    if (!market) {
      fail(res, 404, "NOT_FOUND", "Market not found");
      return;
    }

    if (!oracleService.CANCELLABLE_MARKET_STATUSES.includes(market.status)) {
      fail(res, 409, "INVALID_STATE", `Market cannot be cancelled from status ${market.status}`);
      return;
    }

    await oracleService.enqueueCancellation(marketId, reason.trim());
    ok(res, { success: true, marketId, status: "queued" }, { status: 202 });
  } catch (err) {
    next(err);
  }
}
