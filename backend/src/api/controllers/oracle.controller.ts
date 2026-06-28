import { timingSafeEqual } from "crypto";
import { Request, Response, NextFunction } from "express";
import * as oracleService from "../../services/oracle.service";

// ---------------------------------------------------------------------------
// Timing-safe Bearer token check for ORACLE_API_KEY
// ---------------------------------------------------------------------------
function checkOracleAuth(req: Request): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return false;

  const provided = authHeader.slice(7);
  const expected = process.env.ORACLE_API_KEY ?? "";
  if (!expected) return false;

  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    const len = Math.max(a.length, b.length);
    const bufA = Buffer.alloc(len);
    const bufB = Buffer.alloc(len);
    a.copy(bufA);
    b.copy(bufB);
    return timingSafeEqual(bufA, bufB) && a.length === b.length;
  } catch {
    return false;
  }
}

/**
 * POST /api/oracle/submit (issue #908)
 * Header: Authorization: Bearer <ORACLE_API_KEY>
 * Body: { market_id, outcome, source }
 *
 * Returns 401 if auth fails, 400 if body invalid, 201 with OracleResult on success.
 */
export async function submitOracleResultHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!checkOracleAuth(req)) {
      res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
      return;
    }

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
 * Admin-protected. Lists all submitted oracle results with confirmed status.
 */
export async function listOracleResultsHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
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
