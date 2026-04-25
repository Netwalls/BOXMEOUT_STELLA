// ============================================================
// BOXMEOUT — Oracle Controller
// Protected by oracle API key middleware.
// ============================================================

import type { Request, Response } from 'express';

/**
 * POST /api/oracle/submit
 * Body: { match_id, outcome, reported_at, signature, oracle_address }
 *
 * Receives a signed OracleReport from an authorized oracle.
 * Steps:
 *   1. Validate request body with Zod schema
 *   2. Call OracleService.verifyOracleReport() — respond 401 if invalid
 *   3. Call OracleService.submitFightResult()
 *   4. Respond 200 with { tx_hash, report_id }
 *
 * Protected by oracle API key header: X-Oracle-Key
 */
export async function submitOracleResult(
  _req: Request,
  _res: Response,
): Promise<void> {
  // TODO: implement
}

/**
 * GET /api/oracle/reports/:match_id
 *
 * Returns all oracle reports (accepted and rejected) for a fight.
 * Public endpoint — used for transparency and dispute investigation.
 * Responds 200 with OracleReport[].
 */
export async function getOracleReports(
  _req: Request,
  _res: Response,
): Promise<void> {
  // TODO: implement
}
