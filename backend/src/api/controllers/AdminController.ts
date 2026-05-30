// ============================================================
// BOXMEOUT — Admin Controller
// All routes protected by JWT middleware + admin role check.
// ============================================================

import type { Request, Response } from 'express';
import { Keypair } from '@stellar/stellar-sdk';
import { AppError } from '../../utils/AppError';
import * as StellarService from '../../services/StellarService';
import * as OracleService from '../../oracle/OracleService';
import { verifyToken } from '../../services/totp.service';
import { db } from '../../services/MarketService';
import { pool } from '../../config/db';

/**
 * POST /api/admin/dispute/:market_id
 * Body: { reason: string }
 *
 * Flags a market as disputed.
 * Steps:
 *   1. Require admin JWT (middleware)
 *   2. Validate market exists and is in "resolved" status
 *   3. Call StellarService.invokeContract("dispute_market", [admin, reason])
 *   4. Update market status to 'disputed' in DB after tx confirmed
 *   5. Respond 200 with { tx_hash }
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

  // Validate market exists and status
  const market = await db().findMarketById(market_id);
  if (!market) {
    throw new AppError(404, `Market not found: ${market_id}`);
  }
  if (market.status !== 'resolved') {
    throw new AppError(400, 'Market must be resolved to dispute');
  }

  // Assume admin address from env or user
  const adminAddress = process.env.ADMIN_ADDRESS ?? 'G...'; // TODO: get from user

  // Call StellarService
  const txHash = await StellarService.invokeContract(
    market.contract_address,
    'dispute_market',
    [adminAddress, reason]
  );

  // Update DB
  await db().updateMarketStatus(market_id, 'disputed');

  res.json({ tx_hash: txHash });
}

/**
 * POST /api/admin/resolve-dispute/:market_id
 * Body: { final_outcome: string }
 *
 * Resolves a disputed market with the admin-verified outcome.
 * Steps:
 *   1. Require admin JWT (middleware)
 *   2. Validate final_outcome in request body
 *   3. Call OracleService.raiseDispute() to broadcast on-chain
 *   4. Update Dispute.status to 'resolved' and set final_outcome
 *   5. Return updated market and dispute records
 */
export async function resolveDispute(
  req: Request,
  res: Response,
): Promise<void> {
  const { market_id } = req.params;
  const { final_outcome } = req.body;

  // Validate required body fields
  if (!final_outcome || typeof final_outcome !== 'string') {
    throw new AppError(400, 'final_outcome is required');
  }

  const validOutcomes = ['fighter_a', 'fighter_b', 'draw', 'no_contest'];
  if (!validOutcomes.includes(final_outcome)) {
    throw new AppError(400, `final_outcome must be one of: ${validOutcomes.join(', ')}`);
  }

  // Retrieve market to get match_id
  const market = await db().findMarketById(market_id);
  if (!market) {
    throw new AppError(404, `Market not found: ${market_id}`);
  }

  // Build admin_signature from ADMIN_PRIVATE_KEY
  const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
  if (!adminPrivateKey) {
    throw new AppError(500, 'ADMIN_PRIVATE_KEY is not configured on this server');
  }
  const adminKeypair = Keypair.fromSecret(adminPrivateKey);
  const signaturePayload = Buffer.from(`${market_id}:${final_outcome}`, 'utf8');
  const admin_signature = Buffer.from(adminKeypair.sign(signaturePayload)).toString('hex');

  // Call OracleService.raiseDispute() to broadcast on-chain
  const tx_hash = await OracleService.raiseDispute(
    market.match_id,
    final_outcome as OracleService.FightOutcome,
    admin_signature,
  );

  // Update Dispute.status to 'resolved' and set final_outcome
  const disputeResult = await pool.query(
    `UPDATE disputes 
     SET status = 'resolved', final_outcome = $1, resolved_at = NOW()
     WHERE market_id = $2 AND status = 'open'
     RETURNING *`,
    [final_outcome, market_id],
  );

  if (disputeResult.rowCount === 0) {
    throw new AppError(404, `No open dispute found for market: ${market_id}`);
  }

  // Return updated market and dispute records
  res.status(200).json({
    tx_hash,
    dispute: disputeResult.rows[0],
    market: { ...market, outcome: final_outcome, status: 'resolved' },
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

  // Validate market exists and status
  const market = await db().findMarketById(market_id);
  if (!market) {
    throw new AppError(404, `Market not found: ${market_id}`);
  }
  if (market.status !== 'open' && market.status !== 'locked') {
    throw new AppError(400, 'Market must be open or locked to cancel');
  }

  // Assume admin address from env or user
  const adminAddress = process.env.ADMIN_ADDRESS ?? 'G...'; // TODO: get from user

  // Call StellarService
  const txHash = await StellarService.invokeContract(
    market.contract_address,
    'cancel_market',
    [adminAddress, reason]
  );

  // Update DB
  await db().updateMarketStatus(market_id, 'cancelled');

  res.json({ tx_hash: txHash });
}

/**
 * GET /api/admin/disputes
 *
 * Returns all open disputes with market and oracle report details.
 * Steps:
 *   1. Require admin JWT (middleware)
 *   2. Query disputes with status = 'open'
 *   3. JOIN with markets and oracle_reports tables
 *   4. Sort by raised_at DESC
 *   5. Respond 200 with disputes array
 */
export async function listDisputes(
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await pool.query(
    `SELECT 
       d.id,
       d.market_id,
       d.status,
       d.raised_at,
       d.reason,
       m.match_id,
       m.fighter_a,
       m.fighter_b,
       m.outcome,
       m.status as market_status,
       or.oracle_address,
       or.outcome as oracle_outcome,
       or.reported_at
     FROM disputes d
     JOIN markets m ON d.market_id = m.market_id
     LEFT JOIN oracle_reports or ON m.match_id = or.match_id
     WHERE d.status = 'open'
     ORDER BY d.raised_at DESC`,
  );

  res.status(200).json(result.rows);
}
