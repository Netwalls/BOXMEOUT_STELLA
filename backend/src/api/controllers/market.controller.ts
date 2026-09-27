import { Request, Response, NextFunction } from "express";
import { MarketStatus } from "@prisma/client";
import { z } from "zod";
import { logger } from "../../logger";
import * as marketService from "../../services/market.service";
import { searchMarkets } from "../../repositories/market.repository";
import * as oracleService from "../../services/oracle.service";
import { db } from "../../db";

// ─── Validation schemas ───────────────────────────────────────────────────────

const marketsQuerySchema = z.object({
  status: z.nativeEnum(MarketStatus).optional(),
  weightClass: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const marketBetsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const createMarketSchema = z.object({
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
    res.status(400).json({ error: "q is required", code: "VALIDATION_ERROR" });
    return;
  }
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const result = await searchMarkets(q, page, limit);
  res.json(result);
}

/**
 * GET /api/markets
 * Optional query params: status, weightClass, page, limit
 */
export async function getMarketsHandler(req: Request, res: Response): Promise<void> {
  const parsed = marketsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
    return;
  }

  try {
    const { status, weightClass, page, limit } = parsed.data;
    const markets = await marketService.getAllMarkets(
      { status, weightClass },
      { page, limit }
    );
    res.json({ data: markets, page, limit });
  } catch (err) {
    logger.error({ err }, "getMarketsHandler failed");
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/markets/:id
 */
export async function getMarketByIdHandler(req: Request, res: Response): Promise<void> {
  try {
    const market = await marketService.getMarketById(req.params.id);
    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }
    res.json({ data: market });
  } catch (err) {
    logger.error({ err }, "getMarketByIdHandler failed");
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/markets
 * Creates a new market record. Body validated via zod.
 */
export async function createMarketHandler(req: Request, res: Response): Promise<void> {
  const parsed = createMarketSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
    return;
  }

  try {
    const data = parsed.data;
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
    res.status(201).json({ data: market });
  } catch (err) {
    logger.error({ err }, "createMarketHandler failed");
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/markets/:id/stats
 */
export async function getMarketStatsHandler(req: Request, res: Response): Promise<void> {
  try {
    const stats = await marketService.getMarketStats(req.params.id);
    res.json({ data: stats });
  } catch (err: any) {
    if (err?.code === "NOT_FOUND") {
      res.status(404).json({ error: "Market not found" });
      return;
    }
    logger.error({ err }, "getMarketStatsHandler failed");
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/markets/:id/bets
 * Returns leaderboard/bets for a market with cursor pagination.
 * Query params: cursor, limit (max 100). Response includes nextCursor.
 */
export async function getMarketBetsHandler(req: Request, res: Response): Promise<void> {
  const parsed = marketBetsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
    return;
  }

  try {
    const { cursor, limit } = parsed.data;
    const { data, nextCursor } = await marketService.getMarketLeaderboard(req.params.id, {
      cursor,
      limit,
    });
    res.json({ data, nextCursor, limit });
  } catch (err) {
    logger.error({ err }, "getMarketBetsHandler failed");
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/admin/markets/resolve
 * Body: { oracle_result_id: number }
 * Admin-protected. Confirms an oracle result and triggers on-chain market resolution.
 */
export async function resolveMarketHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { market_id, marketId, outcome, oracle_result_id, source, reporter } = req.body;
    const targetMarketId = market_id || marketId;

    if (oracle_result_id === undefined || oracle_result_id === null) {
      res
        .status(400)
        .json({ error: "oracle_result_id is required", code: "VALIDATION_ERROR" });
      return;
    }

    const id = Number(oracle_result_id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({
        error: "oracle_result_id must be a positive integer",
        code: "VALIDATION_ERROR",
      });
      return;
    }

    res.status(400).json({ error: "market_id (or marketId) and outcome required", code: "VALIDATION_ERROR" });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/markets/dispute/resolve
 */
export async function resolveDisputeHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { dispute_id, disputeId, outcome, notes, decisionNotes } = req.body;
    const targetDisputeId = dispute_id || disputeId;
    const notesText = notes || decisionNotes;

    if (!targetDisputeId) {
      res.status(400).json({ error: "dispute_id is required", code: "VALIDATION_ERROR" });
      return;
    }

    if (!outcome) {
      res.status(400).json({ error: "outcome is required", code: "VALIDATION_ERROR" });
      return;
    }

    if (!notesText || !String(notesText).trim()) {
      res.status(400).json({ error: "Notes explaining the decision are required for audit", code: "VALIDATION_ERROR" });
      return;
    }

    const admin = (req as any).user?.id || (req as any).admin || "admin";

    const result = await ResolutionService.handleDispute({
      disputeId: String(targetDisputeId),
      outcome,
      admin,
      notes: String(notesText),
    });

    res.status(200).json({ success: true, status: "ok", data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/markets/:marketId/resolve
 * Body: { outcome, source }
 * Admin-protected. Resolves a market by ID and writes an 

/* … truncated 3066 chars — edit only what you need near the top … */
