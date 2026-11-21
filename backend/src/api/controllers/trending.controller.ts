import type { Request, Response } from "express";
import { z } from "zod";
import { logger } from "../../logger";
import * as trendingService from "../../services/trending.service";
import { ok, fail } from "../response";

const querySchema = z.object({
  window: z.enum(["1h", "24h", "7d"]).optional(),
  limit: z.coerce.number().int().min(1).optional(),
});

/** GET /api/markets/trending?window=1h|24h|7d&limit= (#1572 B-136) */
export async function getTrendingMarketsHandler(req: Request, res: Response): Promise<void> {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    fail(res, 400, "VALIDATION_ERROR", "Validation failed", { details: parsed.error.flatten() });
    return;
  }

  const options = trendingService.normaliseTrendingOptions(parsed.data);
  try {
    const markets = await trendingService.getTrendingMarkets(options);
    ok(res, markets, { meta: { window: options.window, limit: options.limit } });
  } catch (err) {
    logger.error({ err }, "Failed to compute trending markets");
    fail(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
}
