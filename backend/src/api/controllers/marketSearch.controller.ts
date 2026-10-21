import { Request, Response } from "express";
import { logger } from "../../logger";
import { searchMarkets } from "../../repositories/market.repository";
import { marketSearchQuerySchema } from "../schemas/market.schema";
import { pageMeta } from "../schemas/pagination";

/**
 * GET /api/markets/search?q=&page=&limit=
 * Full-text search across question + description. Returns { data, total, page, limit, meta }.
 * q: 1-100 characters after trimming. page/limit follow the shared pagination rules.
 */
export async function searchMarketsHandler(req: Request, res: Response): Promise<void> {
  const parsed = marketSearchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message ?? "Validation failed",
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
    return;
  }

  try {
    const { q, page, limit } = parsed.data;
    const result = await searchMarkets(q, page, limit);
    res.json({ ...result, page, limit, meta: pageMeta(page, limit, result.total) });
  } catch (err) {
    logger.error({ err }, "searchMarketsHandler failed");
    res.status(500).json({ error: "Internal server error" });
  }
}
