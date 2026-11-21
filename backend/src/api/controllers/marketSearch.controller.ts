import { Request, Response } from "express";
import { logger } from "../../logger";
import { searchMarkets, suggestMarkets } from "../../repositories/market.repository";
import { marketSearchQuerySchema, marketSuggestQuerySchema } from "../schemas/market.schema";
import { ok } from "../response";
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

/**
 * B-158: GET /api/markets/suggest?q=
 * Prefix autocomplete over question and fighter names. q is 2-100 characters.
 * Returns at most 8 { id, label } items in the standard { data } envelope.
 */
export async function suggestMarketsHandler(req: Request, res: Response): Promise<void> {
  const parsed = marketSuggestQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Validation failed",
        details: parsed.error.flatten(),
      },
    });
    return;
  }

  try {
    const items = await suggestMarkets(parsed.data.q);
    ok(res, items);
  } catch (err) {
    logger.error({ err }, "suggestMarketsHandler failed");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
  }
}
