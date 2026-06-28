import { Request, Response, NextFunction } from "express";
import { PrismaClient, MarketStatus } from "@prisma/client";
import { logger } from "../../logger";
import { z } from "zod";
import * as marketService from "../../services/market.service";
import { searchMarkets } from "../../repositories/market.repository";
import * as oracleService from "../../services/oracle.service";

const prisma = new PrismaClient();

const marketsQuerySchema = z.object({
  status: z.nativeEnum(MarketStatus).optional(),
  weightClass: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/**
 * GET /api/markets/search?q=&page=&limit=
 * Full-text search across question + description. Returns paginated { data, total }.
 */
export async function searchMarketsHandler(req: Request, res: Response): Promise<void> {
  const q = String(req.query.q ?? "").trim();
  if (!q) { res.status(400).json({ error: "q is required" }); return; }
  const page  = Math.max(1, parseInt(String(req.query.page  ?? "1"),  10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const result = await searchMarkets(q, page, limit);
  res.json(result);
}

/**
 * GET /api/markets
 */
export async function getMarketsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { status, weightClass, page = "1", limit = "20" } = req.query as Record<string, string>;
    const markets = await marketService.getAllMarkets(
      { status: status as marketService.MarketFilters["status"], weightClass },
      { page: parseInt(page, 10), limit: parseInt(limit, 10) }
    );
    res.json({ data: markets, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    logger.error({ err }, "getMarketsHandler failed");
    res.status(500).json({ error: "Internal server error" });
  }
}

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

export async function getMarketStatsHandler(req: Request, res: Response): Promise<void> {
  try {
    const stats = await marketService.getMarketStats(req.params.id);
    res.json({ data: stats });
  } catch (err) {
    logger.error({ err }, "getMarketStatsHandler failed");
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/markets/:id/bets
 */
export async function getMarketBetsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { page = "1", limit = "20" } = req.query as Record<string, string>;
    const bets = await marketService.getMarketLeaderboard(req.params.id);
    res.json({ data: bets, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    logger.error({ err }, "getMarketBetsHandler failed");
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/admin/markets/resolve (issue #909)
 * Body: { oracle_result_id: number }
 * Admin-protected (adminAuth middleware). Confirms an oracle result and
 * triggers on-chain market resolution. Returns 200 { status: 'ok' }.
 */
export async function resolveMarketHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { oracle_result_id } = req.body;

    if (oracle_result_id === undefined || oracle_result_id === null) {
      res.status(400).json({ error: "oracle_result_id is required", code: "VALIDATION_ERROR" });
      return;
    }

    const id = Number(oracle_result_id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "oracle_result_id must be a positive integer", code: "VALIDATION_ERROR" });
      return;
    }

    await oracleService.confirmFightResult(String(id), "admin");
    res.status(200).json({ status: "ok" });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/markets/dispute/resolve
 */
export async function resolveDisputeHandler(req: Request, res: Response): Promise<void> {
  try {
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "resolveDisputeHandler failed");
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/admin/markets/pending
 */
export async function getPendingResolutionsHandler(req: Request, res: Response): Promise<void> {
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
export async function healthCheckHandler(req: Request, res: Response): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok", db: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", db: "disconnected" });
  }
}
