import type { Request, Response } from "express";
import { logger } from "../../logger";
import * as statsService from "../../services/stats.service";
import { ok, fail } from "../response";

/** GET /api/stats — platform-wide totals (#1571 B-135). */
export async function getPlatformStatsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const stats = await statsService.getPlatformStats();
    ok(res, stats);
  } catch (err) {
    logger.error({ err }, "Failed to compute platform stats");
    fail(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
}
