import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import * as marketService from "../../services/market.service";
import { searchMarkets } from "../../repositories/market.repository";

const prisma = new PrismaClient();

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
 * Query params: status, weightClass, page, limit
 * Returns paginated list of boxing markets.
 */
export async function getMarketsHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * GET /api/markets/:id
 * Returns full market detail. Responds 404 if not found.
 */
export async function getMarketByIdHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * GET /api/markets/:id/stats
 * Returns aggregate stats: bet count, volume, current odds.
 */
export async function getMarketStatsHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * GET /api/markets/:id/bets
 * Returns all bets for a specific market. Supports pagination.
 */
export async function getMarketBetsHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * POST /api/admin/markets/resolve
 * Body: { market_id, outcome, source }
 * Admin-protected. Submits oracle result and triggers on-chain resolution.
 */
export async function resolveMarketHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * POST /api/admin/markets/dispute/resolve
 * Body: { dispute_id, override_outcome }
 * Admin-protected. Resolves a disputed market with an override outcome.
 */
export async function resolveDisputeHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * GET /api/admin/markets/pending
 * Admin-protected. Returns markets in Locked status awaiting resolution.
 */
export async function getPendingResolutionsHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * GET /health
 * Returns { status: "ok", db: "connected" } if service is healthy.
 * Used by load balancers and uptime monitors.
 */
export async function healthCheckHandler(req: Request, res: Response): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok", db: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", db: "disconnected" });
  }
}
