import type { NextFunction, Request, Response } from "express";
import type { Outcome } from "@prisma/client";
import { db } from "../../db";
import * as oracleService from "../../services/oracle.service";
import { ok, fail } from "../response";

const OUTCOMES: readonly Outcome[] = ["FighterA", "FighterB", "Draw", "NoContest"];

function parseOutcome(value: unknown): Outcome | null {
  return OUTCOMES.find((outcome) => outcome === value) ?? null;
}

/**
 * Queues the on-chain resolve_market() submission for a market. The enqueue is
 * idempotent per market, so repeated admin calls do not double-submit.
 * Responds 404 when the market does not exist.
 */
async function queueMarketResolution(
  res: Response,
  marketId: string,
  outcome: Outcome,
): Promise<void> {
  const market = await db.market.findUnique({ where: { id: marketId }, select: { id: true } });

  if (!market) {
    fail(res, 404, "NOT_FOUND", "Market not found");
    return;
  }

  await oracleService.enqueueResolution(marketId, outcome);
  ok(res, { success: true, marketId, outcome }, { status: 202 });
}

/**
 * POST /api/admin/markets/:marketId/resolve
 * Body: { outcome: "FighterA" | "FighterB" | "Draw" | "NoContest" }
 * Admin-protected. The market id is in the path, the outcome in the body.
 */
export async function resolveMarketByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const outcome = parseOutcome(req.body?.outcome);

    if (!outcome) {
      fail(res, 400, "VALIDATION_ERROR", "outcome must be one of FighterA, FighterB, Draw, NoContest");
      return;
    }

    await queueMarketResolution(res, req.params.marketId, outcome);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/markets/resolve
 * Body: { market_id | marketId, outcome }
 *
 * @deprecated Use POST /api/admin/markets/:marketId/resolve. Kept as an alias so
 * existing callers keep working. Responses carry a Deprecation header.
 */
export async function resolveMarketHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  res.setHeader("Deprecation", "true");
  res.setHeader("Link", '</api/admin/markets/{marketId}/resolve>; rel="successor-version"');

  try {
    const { market_id, marketId, outcome } = req.body ?? {};
    const targetMarketId = market_id || marketId;
    const parsedOutcome = parseOutcome(outcome);

    if (!targetMarketId || !parsedOutcome) {
      fail(res, 400, "VALIDATION_ERROR", "market_id (or marketId) and outcome required");
      return;
    }

    await queueMarketResolution(res, String(targetMarketId), parsedOutcome);
  } catch (err) {
    next(err);
  }
}
