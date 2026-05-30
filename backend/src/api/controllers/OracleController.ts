// ============================================================
// BOXMEOUT — Oracle Controller
// Protected by oracle API key middleware.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../../utils/AppError';
import { validateBody } from '../middleware/validate';
import * as OracleService from '../../oracle/OracleService';

// ---------------------------------------------------------------------------
// Zod schema for POST /api/oracle/submit body
// ---------------------------------------------------------------------------
const submitOracleResultSchema = z.object({
  match_id: z.string().min(1, 'match_id is required'),
  outcome: z.enum(['fighter_a', 'fighter_b', 'draw', 'no_contest'], {
    errorMap: () => ({
      message: "outcome must be one of: fighter_a, fighter_b, draw, no_contest",
    }),
  }),
  reported_at: z
    .string()
    .datetime({ message: 'reported_at must be a valid ISO 8601 datetime string' }),
  signature: z
    .string()
    .regex(/^[0-9a-fA-F]+$/, 'signature must be a hex-encoded string')
    .min(1, 'signature is required'),
  oracle_address: z
    .string()
    .min(1, 'oracle_address is required'),
});

// Export the validation middleware so the route can apply it before the handler
export const validateSubmitOracleResult = validateBody(submitOracleResultSchema);

/**
 * POST /api/oracle/submit
 * Body: { match_id, outcome, reported_at, signature, oracle_address }
 *
 * Receives a signed OracleReport from an authorized oracle.
 * Steps:
 *   1. Validate X-Oracle-Key header against ORACLE_API_KEY env var
 *   2. Validate request body with Zod schema (applied as middleware before this handler)
 *   3. Call OracleService.verifyOracleReport() — respond 401 if invalid
 *   4. Call OracleService.submitFightResult()
 *   5. Respond 200 with { tx_hash, report_id }
 *
 * Protected by oracle API key header: X-Oracle-Key
 */
export async function submitOracleResult(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Step 1 — Validate X-Oracle-Key header
    const apiKey = req.headers['x-oracle-key'];
    const expectedKey = process.env.ORACLE_API_KEY;

    if (!expectedKey) {
      // Misconfigured server — fail closed
      return next(new AppError(500, 'Oracle API key is not configured'));
    }

    if (!apiKey || apiKey !== expectedKey) {
      return next(new AppError(401, 'Invalid or missing X-Oracle-Key header'));
    }

    // Step 2 — Body already validated and typed by validateSubmitOracleResult middleware
    const { match_id, outcome, reported_at, signature, oracle_address } =
      req.body as z.infer<typeof submitOracleResultSchema>;

    // Build a partial OracleReport for verification (id/accepted/tx_hash/created_at
    // are not known yet — verifyOracleReport only needs the crypto fields)
    const reportToVerify = {
      match_id,
      outcome,
      reported_at: new Date(reported_at),
      signature,
      oracle_address,
    };

    // Step 3 — Verify signature + whitelist
    const isValid = await OracleService.verifyOracleReport(
      reportToVerify as Parameters<typeof OracleService.verifyOracleReport>[0],
    );

    if (!isValid) {
      return next(new AppError(401, 'Oracle report signature is invalid or oracle is not whitelisted'));
    }

    // Step 4 — Submit the fight result on-chain and persist to DB
    const savedReport = await OracleService.submitFightResult(
      match_id,
      outcome as OracleService.FightOutcome,
    );

    // Step 5 — Respond with tx_hash and report_id
    res.status(200).json({
      tx_hash: savedReport.tx_hash,
      report_id: savedReport.id,
    });
  } catch (err) {
    next(err);
  }
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
