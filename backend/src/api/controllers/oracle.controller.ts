import { Request, Response, NextFunction } from "express";
import * as oracleService from "../../services/oracle.service";
import { db } from "../../db";

/**
 * POST /api/oracle/submit (issue #908)
 * Header: X-Oracle-Key: <ORACLE_API_KEY>  (auth handled by oracleAuth middleware)
 * Body: { market_id, outcome, source }
 *
 * Returns 400 if body invalid, 201 with OracleResult on success.
 */
export async function submitOracleResultHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { market_id, outcome, source } = req.body as {
      market_id: string;
      outcome: string;
      source: string;
    };

    const result = await oracleService.submitFightResult(
      market_id,
      outcome as Parameters<typeof oracleService.submitFightResult>[1],
      source,
      "oracle",
    );

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/oracle/results
 * Admin-protected. Lists paginated oracle results with optional filters.
 *
 * Query params:
 *   marketId  — filter by market ID (optional)
 *   confirmed — filter by confirmation status: "true" | "false" (optional)
 *   page      — 1-based page number (default: 1)
 *   pageSize  — results per page (default: 20, max: 100)
 */
export async function listOracleResultsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { marketId, confirmed } = req.query as {
      marketId?: string;
      confirmed?: string;
    };

    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt((req.query.pageSize as string) ?? "20", 10) || 20),
    );

    // Build the Prisma where clause from query params
    const where: {
      marketId?: string;
      confirmed?: boolean;
    } = {};

    if (marketId) {
      where.marketId = marketId;
    }
    if (confirmed !== undefined) {
      where.confirmed = confirmed === "true";
    }

    const [total, results] = await Promise.all([
      db.oracleResult.count({ where }),
      db.oracleResult.findMany({
        where,
        orderBy: { reportedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    res.status(200).json({
      data: results,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Oracle Address Management Endpoints (Issue #455) ────────────────────────

/**
 * GET /api/admin/oracles
 * List all registered oracles
 */
export async function getAllOraclesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const oracles = await oracleService.getAllOracles();
    res.status(200).json(oracles);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/oracles
 * Create a new oracle entry
 * Body: { address: string, name: string }
 */
export async function createOracleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { address, name } = req.body as { address?: string; name?: string };

    if (!address || !name) {
      res.status(400).json({ error: "Missing required fields: address, name" });
      return;
    }

    const oracle = await oracleService.createOracle(address, name);
    res.status(201).json(oracle);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/oracles/:id
 * Update oracle name or active status
 * Body: { name?: string, active?: boolean }
 */
export async function updateOracleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const { name, active } = req.body as { name?: string; active?: boolean };

    if (name === undefined && active === undefined) {
      res.status(400).json({ error: "At least one field (name, active) is required" });
      return;
    }

    const oracle = await oracleService.updateOracle(id, {
      ...(name && { name }),
      ...(active !== undefined && { active }),
    });

    res.status(200).json(oracle);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/admin/oracles/:id
 * Deactivate an oracle (soft delete)
 */
export async function deleteOracleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const oracle = await oracleService.deleteOracle(id);
    res.status(200).json(oracle);
  } catch (err) {
    next(err);
  }
}
