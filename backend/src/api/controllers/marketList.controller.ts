import { Request, Response } from "express";
import { MarketStatus } from "@prisma/client";
import { z } from "zod";
import { logger } from "../../logger";
import * as marketService from "../../services/market-list.service";
import { MARKET_SORTS } from "../../services/market-sort";
import { pageQuerySchema } from "../schemas/pagination";
import { ok, fail } from "../response";

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * B-122 (#1558): GET /api/markets query. `sort` is a whitelist; anything else
 * is rejected with 400 VALIDATION_ERROR by the zod enum.
 */
const marketsQuerySchema = pageQuerySchema.extend({
  status: z.nativeEnum(MarketStatus).optional(),
  weightClass: z.string().optional(),
  categoryId: z.string().min(1).optional(),
  sort: z.enum(MARKET_SORTS).default("soonest"),
  order: z.enum(["asc", "desc"]).default("asc"),
});

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * GET /api/markets
 * Optional query params: status, weightClass, categoryId, sort=soonest|newest|pool,
 * order=asc|desc, page, limit
 */
export async function getMarketsHandler(req: Request, res: Response): Promise<void> {
  const parsed = marketsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    fail(res, 400, "VALIDATION_ERROR", "Validation failed", { details: parsed.error.flatten() });
    return;
  }

  try {
    const { status, weightClass, categoryId, sort, order, page, limit } = parsed.data;
    const { data, total } = await marketService.getAllMarkets(
      { status, weightClass, categoryId },
      { page, pageSize: limit },
      sort,
      order
    );
    ok(res, data, { meta: { page, limit, total } });
  } catch (err) {
    logger.error({ err }, "getMarketsHandler failed");
    fail(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
}

