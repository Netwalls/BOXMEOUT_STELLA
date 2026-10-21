import { Request, Response, NextFunction } from "express";
import { MarketStatus } from "@prisma/client";
import { z } from "zod";
import { logger, sanitizeErrorForLog } from "../../logger";
import { isUniqueConstraintError } from "../../lib/prisma-errors";
import * as marketService from "../../services/market.service";
import * as oracleService from "../../services/oracle.service";
import { db } from "../../db";
import { ok, fail } from "../response";

/** Admin identity from the auth context, falling back to a generic label. */
function adminIdFromRequest(req: Request): string {
  const authed = req as Request & { user?: { id?: string }; admin?: string };
  return authed.user?.id || authed.admin || "admin";
}

// ─── Validation schemas ───────────────────────────────────────────────────────

const marketsQuerySchema = pageQuerySchema.extend({
  status: z.nativeEnum(MarketStatus).optional(),
  weightClass: z.string().optional(),
});

const marketBetsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const oddsHistoryQuerySchema = z.object({
  interval: z.enum(["5m", "1h"]).optional(),
});

const resolveMarketBodySchema = z.object({
  oracle_result_id: z.coerce.number().int().positive(),
});

export const createMarketSchema = z.object({
  id: z.string().min(1),
  contractAddress: z.string().min(1),
  fighterA: z.record(z.unknown()),
  fighterB: z.record(z.unknown()),
  scheduledAt: z.string().datetime({ message: "scheduledAt must be a valid ISO 8601 datetime" }),
  bettingEndsAt: z.string().datetime({ message: "bettingEndsAt must be a valid ISO 8601 datetime" }),
  createdBy: z.string().min(1),
  oracleAddress: z.string().min(1),
  txHash: z.string().optional(),
});

// ─── Handlers ─────────────────────────────────────────────────────────────────

/**
 * GET /api/markets/search?q=&page=&limit=
 * Full-text search across question + description. Returns paginated { data, total }.
 */
export async function searchMarketsHandler(
  req: Request,
  res: Response
): Promise<void> {
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    fail(res, 400, "VALIDATION_ERROR", "q is required");
    return;
  }
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const result = await searchMarkets(q, page, limit);
  ok(res, result.data, { meta: { total: result.total } });
}

/**
 * GET /api/markets
 * Optional query params: status, weightClass, page, limit
 */
export async function getMarketsHandler(req: Request, res: Response): Promise<void> {
  const parsed = marketsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    fail(res, 400, "VALIDATION_ERROR", "Validation failed", { details: parsed.error.flatten() });
    return;
  }

  try {
    const { status, weightClass, page, limit } = parsed.data;
    const { data, total } = await marketService.getAllMarkets(
      { status, weightClass },
      { page, pageSize: limit }
    );
    ok(res, markets, { meta: { page, limit } });
  } catch (err) {
    logger.error({ err }, "getMarketsHandler failed");
    fail(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
}

/**
 * GET /api/markets/:id
 */
export async function getMarketByIdHandler(req: Request, res: Response): Promise<void> {
  try {
    const market = await marketService.getMarketById(req.params.id);
    if (!market) {
      fail(res, 404, "NOT_FOUND", "Market not found");
      return;
    }
    ok(res, market);
  } catch (err) {
    logger.error({ err }, "getMarketByIdHandler failed");
    fail(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
}

/**
 * GET /api/markets/:id/odds-history
 * Optional query param: interval=5m|1h
 * Returns an array of OddsSnapshot { timestamp, poolA, poolB, oddsA, oddsB }
 * derived from bets. When interval is omitted, raw per-bet snapshots are returned.
 */
export async function getMarketOddsHistoryHandler(
  req: Request,
  res: Response
): Promise<void> {
  const parsed = oddsHistoryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    fail(res, 400, "VALIDATION_ERROR", "Validation failed", { details: parsed.error.flatten() });
    return;
  }

  try {
    const snapshots = await marketService.getOddsHistory(
      req.params.id,
      parsed.data.interval
    );
    res.json({ data: snapshots });
  } catch (err) {
    if ((err as { code?: string })?.code === "NOT_FOUND") {
      res.status(404).json({ error: "Market not found" });
      return;
    }
    logger.error({ err }, "getMarketOddsHistoryHandler failed");
    fail(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
}

/**
 * POST /api/markets
 * Creates a new market record.
 * Auth: walletAuthMiddleware (challenge/response, caller proves wallet ownership).
 * Body: validated by validate(createMarketSchema) middleware before this handler runs.
 */
export async function createMarketHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = req.body as z.infer<typeof createMarketSchema>;
    const market = await marketService.createMarketRecord({
      id: data.id,
      contractAddress: data.contractAddress,
      fighterA: data.fighterA,
      fighterB: data.fighterB,
      scheduledAt: new Date(data.scheduledAt),
      bettingEndsAt: new Date(data.bettingEndsAt),
      createdAt: new Date(),
      createdBy: data.createdBy,
      oracleAddress: data.oracleAddress,
      txHash: data.txHash,
    });
    ok(res, market, { status: 201 });
  } catch (err) {
    logger.error({ err }, "createMarketHandler failed");
    fail(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
}

/**
 * GET /api/markets/:id/stats
 */
export async function getMarketStatsHandler(req: Request, res: Response): Promise<void> {
  try {
    const stats = await marketService.getMarketStats(req.params.id);
    res.json({ data: stats });
  } catch (err) {
    if ((err as { code?: string })?.code === "NOT_FOUND") {
      res.status(404).json({ error: "Market not found" });
      return;
    }
    logger.error({ err }, "getMarketStatsHandler failed");
    fail(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
}

/**
 * GET /api/markets/:id/bets
 * Returns leaderboard/bets for a market with page pagination.
 * Query params: page, limit (max 100).
 */
export async function getMarketBetsHandler(req: Request, res: Response): Promise<void> {
  const parsed = marketBetsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    fail(res, 400, "VALIDATION_ERROR", "Validation failed", { details: parsed.error.flatten() });
    return;
  }

  try {
    const { page, limit } = parsed.data;
    const data = await marketService.getMarketLeaderboard(req.params.id, { page, pageSize: limit });
    res.json({ data, page, limit });
  } catch (err) {
    logger.error({ err }, "getMarketBetsHandler failed");
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/admin/markets/resolve
 * Body: { oracle_result_id: number }
 * Admin-protected. Confirms an oracle result and triggers on-chain market resolution.
 * Admin mutations are recorded by auditLogMiddleware (#1258).
 */
export async function resolveMarketHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { oracle_result_id } = req.body;

    if (typeof oracle_result_id !== "string" || oracle_result_id.length === 0) {
      res
        .status(400)
        .json({ error: "oracle_result_id is required", code: "VALIDATION_ERROR" });
      return;
    }

    await oracleService.confirmFightResult(oracle_result_id, adminIdFromRequest(req));
    res.status(200).json({ message: "Oracle result confirmed; on-chain resolution enqueued" });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/markets/dispute/resolve
 */
export async function resolveDisputeHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { dispute_id, disputeId, outcome, notes, decisionNotes } = req.body;
    const targetDisputeId = dispute_id || disputeId;
    const notesText = notes || decisionNotes;

    if (!targetDisputeId) {
      fail(res, 400, "VALIDATION_ERROR", "dispute_id is required");
      return;
    }

    if (!outcome) {
      fail(res, 400, "VALIDATION_ERROR", "outcome is required");
      return;
    }

    if (!notesText || !String(notesText).trim()) {
      fail(res, 400, "VALIDATION_ERROR", "Notes explaining the decision are required for audit");
      return;
    }

    const admin = adminIdFromRequest(req);

    await oracleService.resolveDispute(String(targetDisputeId), outcome, admin);
    const result = { disputeId: String(targetDisputeId), outcome, notes: String(notesText) };

    ok(res, { success: true });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/markets/:marketId/resolve
 * Body: { outcome, source }
 * Admin-protected. Resolves a market by ID and writes an audit log entry.
 */
export async function resolveMarketByIdHandler(req: Request, res: Response): Promise<void> {
  try {
    const { marketId } = req.params;
    const { outcome, source } = req.body;

    if (!outcome || !VALID_OUTCOMES.includes(outcome)) {
      res.status(400).json({
        error: "Invalid or missing outcome",
        code: "INVALID_OUTCOME",
        allowed: VALID_OUTCOMES,
      });
      return;
    }

    if (!source) {
      res.status(400).json({ error: "Missing source", code: "MISSING_SOURCE" });
      return;
    }

    const market = await marketService.resolveMarket(marketId, outcome, source, "admin");
    res.status(200).json({ market, message: "Market resolved successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to resolve market", code: "INTERNAL_ERROR" });
  }
}

/**
 * POST /api/admin/markets/:marketId/cancel
 * Body: { reason? }
 * Admin-protected. Cancels a market and writes an audit log entry.
 */
export async function cancelMarketHandler(req: Request, res: Response): Promise<void> {
  try {
    const { marketId } = req.params;
    const { reason } = req.body;

    const market = await marketService.cancelMarket(marketId, "admin", reason);
    res.status(200).json({ market, message: "Market cancelled" });
  } catch (error) {
    res.status(500).json({ error: "Failed to cancel market", code: "INTERNAL_ERROR" });
  }
}

/**
 * POST /api/admin/markets/:marketId/dispute-resolve
 * Body: { overrideOutcome, resolution? }
 * Admin-protected. Resolves a disputed market with an override and writes an audit log entry.
 */
export async function resolveDisputeByIdHandler(req: Request, res: Response): Promise<void> {
  try {
    const { marketId } = req.params;
    const { overrideOutcome, resolution } = req.body;

    if (!overrideOutcome || !VALID_OUTCOMES.includes(overrideOutcome)) {
      res.status(400).json({
        error: "Invalid or missing overrideOutcome",
        code: "INVALID_OUTCOME",
        allowed: VALID_OUTCOMES,
      });
      return;
    }

    const market = await marketService.resolveMarketDispute(marketId, overrideOutcome, "admin", resolution);
    res.status(200).json({ market, message: "Dispute resolved" });
  } catch (error) {
    res.status(500).json({ error: "Failed to resolve dispute", code: "INTERNAL_ERROR" });
  }
}

/**
 * GET /api/admin/markets/pending
 */
export async function getPendingResolutionsHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const markets = await marketService.getAllMarkets({ status: "Locked" });
    res.json({ data: markets });
  } catch (err) {
    logger.error({ err }, "getPendingResolutionsHandler failed");
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /health
 */
export async function healthCheckHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    await db.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok", db: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", db: "disconnected" });
  }
}
