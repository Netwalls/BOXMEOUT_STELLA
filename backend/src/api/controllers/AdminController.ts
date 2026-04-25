// ============================================================
// BOXMEOUT — Admin Controller
// All routes protected by JWT middleware + admin role check.
// ============================================================

import type { Request, Response } from 'express';
import { AppError } from '../../utils/AppError';
import * as StellarService from '../../services/StellarService';
import { db } from '../../services/MarketService';

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
 * Body: { outcome: string, totp_code: string }
 *
 * Resolves a disputed market with the admin-verified outcome.
 * Steps:
 *   1. Require admin JWT (middleware)
 *   2. Validate TOTP code (2FA) before proceeding
 *   3. Call OracleService.adminOverrideResult(match_id, outcome, admin_signature)
 *   4. Respond 200 with { tx_hash }
 */
export async function resolveDispute(
  _req: Request,
  _res: Response,
): Promise<void> {
  // TODO: implement
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
  _req: Request,
  _res: Response,
): Promise<void> {
  // TODO: implement
}
