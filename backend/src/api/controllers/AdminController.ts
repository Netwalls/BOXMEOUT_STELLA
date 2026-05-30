// ============================================================
// BOXMEOUT — Admin Controller
// All routes protected by JWT middleware + admin role check.
// ============================================================

import type { Request, Response } from 'express';
import { Keypair, nativeToScVal } from '@stellar/stellar-sdk';
import { AppError } from '../../utils/AppError';
import * as StellarService from '../../services/StellarService';
import * as OracleService from '../../oracle/OracleService';
import { db } from '../../services/MarketService';
import { pool } from '../../config/db';

const VALID_OUTCOMES = ['fighter_a', 'fighter_b', 'draw', 'no_contest'] as const;

/**
 * POST /api/admin/dispute/:market_id
 * Body: { reason: string }
 *
 * Phase 1 of the two-phase dispute flow.
 * Flags a resolved market as disputed and creates a dispute record.
 *
 * Steps:
 *   1. Require admin JWT (middleware)
 *   2. Validate market exists and is in "resolved" status
 *   3. Ensure no open or reviewing dispute already exists for this market
 *   4. Call StellarService.invokeContract("dispute_market", [admin, reason])
 *   5. Insert dispute record with status 'open'
 *   6. Update market status to 'disputed'
 *   7. Respond 200 with { tx_hash, dispute }
 */
export async function flagDispute(
  req: Request,
  res: Response,
): Promise<void> {
  const { market_id } = req.params;
  const { reason } = req.body;

  if (!reason || typeof reason !== 'string') {
    throw new AppError(400, 'Reason is required');
  }

  const market = await db().findMarketById(market_id);
  if (!market) {
    throw new AppError(404, `Market not found: ${market_id}`);
  }
  if (market.status !== 'resolved') {
    throw new AppError(400, 'Market must be resolved to dispute');
  }

  // Ensure no active dispute already exists
  const existing = await pool.query(
    `SELECT id FROM disputes WHERE market_id = $1 AND status IN ('open', 'reviewing') LIMIT 1`,
    [market_id],
  );
  if (existing.rows.length > 0) {
    throw new AppError(409, 'An active dispute already exists for this market');
  }

  const adminAddress = process.env.ADMIN_ADDRESS ?? 'G...';

  const txHash = await StellarService.invokeContract(
    market.contract_address,
    'dispute_market',
    [nativeToScVal(adminAddress), nativeToScVal(reason)],
  );

  // Insert dispute record
  const disputeResult = await pool.query(
    `INSERT INTO disputes (market_id, reason, status, raised_at)
     VALUES ($1, $2, 'open', NOW())
     RETURNING *`,
    [market_id, reason],
  );

  await db().updateMarketStatus(market_id, 'disputed');

  res.status(201).json({
    tx_hash: txHash,
    dispute: disputeResult.rows[0],
  });
}

/**
 * POST /api/admin/dispute/:market_id/investigate
 * Body: { admin_notes: string }
 *
 * Phase 2 of the two-phase dispute flow.
 * Admin reviews the disputed market and records investigation notes.
 * Moves the dispute from 'open' to 'reviewing'.
 *
 * Steps:
 *   1. Require admin JWT (middleware)
 *   2. Validate market exists and is in 'disputed' status
 *   3. Validate there's an open dispute record for this market
 *   4. Update dispute status to 'reviewing' with admin_notes
 *   5. Respond 200 with updated dispute
 */
export async function investigateDispute(
  req: Request,
  res: Response,
): Promise<void> {
  const { market_id } = req.params;
  const { admin_notes } = req.body;

  if (!admin_notes || typeof admin_notes !== 'string') {
    throw new AppError(400, 'admin_notes is required');
  }

  const market = await db().findMarketById(market_id);
  if (!market) {
    throw new AppError(404, `Market not found: ${market_id}`);
  }
  if (market.status !== 'disputed') {
    throw new AppError(400, 'Market must be in disputed status to investigate');
  }

  const disputeResult = await pool.query(
    `UPDATE disputes
     SET status = 'reviewing', admin_notes = $1, reviewed_at = NOW()
     WHERE market_id = $2 AND status = 'open'
     RETURNING *`,
    [admin_notes, market_id],
  );

  if (disputeResult.rowCount === 0) {
    throw new AppError(404, `No open dispute found for market: ${market_id}`);
  }

  res.status(200).json({ dispute: disputeResult.rows[0] });
}

/**
 * POST /api/admin/resolve-dispute/:market_id
 * Body: { final_outcome: string }
 *
 * Phase 3 of the two-phase dispute flow.
 * Admin sets the final outcome for the disputed market.
 *
 * Steps:
 *   1. Require admin JWT (middleware)
 *   2. Validate final_outcome in request body
 *   3. Validate market exists and is in 'disputed' status
 *   4. Validate dispute is in 'reviewing' status
 *   5. Build admin_signature from ADMIN_PRIVATE_KEY
 *   6. Call OracleService.raiseDispute() to broadcast on-chain
 *   7. Update dispute status to 'resolved' and set final_outcome
 *   8. Update market outcome and set status back to 'resolved'
 *   9. Return updated dispute and market
 */
export async function resolveDispute(
  req: Request,
  res: Response,
): Promise<void> {
  const { market_id } = req.params;
  const { final_outcome } = req.body;

  if (!final_outcome || typeof final_outcome !== 'string') {
    throw new AppError(400, 'final_outcome is required');
  }

  if (!VALID_OUTCOMES.includes(final_outcome as typeof VALID_OUTCOMES[number])) {
    throw new AppError(400, `final_outcome must be one of: ${VALID_OUTCOMES.join(', ')}`);
  }

  const market = await db().findMarketById(market_id);
  if (!market) {
    throw new AppError(404, `Market not found: ${market_id}`);
  }
  if (market.status !== 'disputed') {
    throw new AppError(400, 'Market must be in disputed status to resolve');
  }

  // Validate dispute is in 'reviewing' state
  const disputeCheck = await pool.query(
    `SELECT id, status FROM disputes WHERE market_id = $1 ORDER BY raised_at DESC LIMIT 1`,
    [market_id],
  );
  if (disputeCheck.rows.length === 0) {
    throw new AppError(404, `No dispute found for market: ${market_id}`);
  }
  if (disputeCheck.rows[0].status !== 'reviewing') {
    throw new AppError(400, 'Dispute must be in reviewing status. Call investigate first.');
  }

  // Build admin_signature
  const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
  if (!adminPrivateKey) {
    throw new AppError(500, 'ADMIN_PRIVATE_KEY is not configured on this server');
  }
  const adminKeypair = Keypair.fromSecret(adminPrivateKey);
  const signaturePayload = Buffer.from(`${market_id}:${final_outcome}`, 'utf8');
  const admin_signature = Buffer.from(adminKeypair.sign(signaturePayload)).toString('hex');

  // Broadcast on-chain
  const tx_hash = await OracleService.raiseDispute(
    market.match_id,
    final_outcome as OracleService.FightOutcome,
    admin_signature,
  );

  // Update dispute record to resolved
  const disputeResult = await pool.query(
    `UPDATE disputes
     SET status = 'resolved', final_outcome = $1, resolved_at = NOW()
     WHERE market_id = $2 AND status = 'reviewing'
     RETURNING *`,
    [final_outcome, market_id],
  );

  if (disputeResult.rowCount === 0) {
    throw new AppError(500, 'Failed to update dispute record');
  }

  // Update market outcome and set status back to resolved
  await pool.query(
    `UPDATE markets
     SET outcome = $1, status = 'resolved', resolved_at = NOW(), updated_at = NOW()
     WHERE market_id = $2`,
    [final_outcome, market_id],
  );

  const updatedMarket = await db().findMarketById(market_id);

  res.status(200).json({
    tx_hash,
    dispute: disputeResult.rows[0],
    market: updatedMarket,
  });
}

/**
 * POST /api/admin/cancel/:market_id
 * Body: { reason: string }
 *
 * Cancels a market — used when a fight is postponed or called off.
 * Steps:
 *   1. Require admin JWT (middleware)
 *   2. Validate market exists and is in "open" or "locked" status
 *   3. Call StellarService.invokeContract("cancel_market", [admin, reason])
 *   4. Respond 200 with { tx_hash }
 */
export async function cancelMarket(
  req: Request,
  res: Response,
): Promise<void> {
  const { market_id } = req.params;
  const { reason } = req.body;

  if (!reason || typeof reason !== 'string') {
    throw new AppError(400, 'Reason is required');
  }

  const market = await db().findMarketById(market_id);
  if (!market) {
    throw new AppError(404, `Market not found: ${market_id}`);
  }
  if (market.status !== 'open' && market.status !== 'locked') {
    throw new AppError(400, 'Market must be open or locked to cancel');
  }

  const adminAddress = process.env.ADMIN_ADDRESS ?? 'G...';

  const txHash = await StellarService.invokeContract(
    market.contract_address,
    'cancel_market',
    [nativeToScVal(adminAddress), nativeToScVal(reason)],
  );

  await db().updateMarketStatus(market_id, 'cancelled');

  res.json({ tx_hash: txHash });
}

/**
 * GET /api/admin/disputes
 * Query: ?status=open|reviewing|resolved (default: open)
 *
 * Returns disputes with market and oracle report details.
 * Steps:
 *   1. Require admin JWT (middleware)
 *   2. Query disputes with optional status filter
 *   3. JOIN with markets and oracle_reports tables
 *   4. Sort by raised_at DESC
 *   5. Respond 200 with disputes array
 */
export async function listDisputes(
  req: Request,
  res: Response,
): Promise<void> {
  const status = (req.query.status as string) || 'open';
  const validStatuses = ['open', 'reviewing', 'resolved'];
  if (!validStatuses.includes(status)) {
    throw new AppError(400, `status must be one of: ${validStatuses.join(', ')}`);
  }

  const result = await pool.query(
    `SELECT
       d.id,
       d.market_id,
       d.status,
       d.reason,
       d.admin_notes,
       d.final_outcome,
       d.raised_at,
       d.reviewed_at,
       d.resolved_at,
       m.match_id,
       m.fighter_a,
       m.fighter_b,
       m.outcome as market_outcome,
       m.status as market_status,
       orr.oracle_address,
       orr.outcome as oracle_outcome,
       orr.reported_at
     FROM disputes d
     JOIN markets m ON d.market_id = m.market_id
     LEFT JOIN LATERAL (
       SELECT oracle_address, outcome, reported_at
       FROM oracle_reports
       WHERE match_id = m.match_id
       ORDER BY reported_at DESC
       LIMIT 1
     ) orr ON true
     WHERE d.status = $1
     ORDER BY d.raised_at DESC`,
    [status],
  );

  res.status(200).json(result.rows);
}
