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
  req: Request,
  res: Response,
): Promise<void> {
  const { market_id } = req.params;
  const { outcome, totp_code } = req.body;

  // Validate required body fields
  if (!totp_code || typeof totp_code !== 'string') {
    throw new AppError(400, 'totp_code is required');
  }
  if (!outcome || typeof outcome !== 'string') {
    throw new AppError(400, 'outcome is required');
  }

  // Step 1: Validate TOTP against ADMIN_TOTP_SECRET env var
  const adminTotpSecret = process.env.ADMIN_TOTP_SECRET;
  if (!adminTotpSecret) {
    throw new AppError(500, 'ADMIN_TOTP_SECRET is not configured on this server');
  }
  const totpValid = verifyToken(adminTotpSecret, totp_code);
  if (!totpValid) {
    throw new AppError(401, 'Invalid TOTP code');
  }

  // Step 2: Build admin_signature from ADMIN_PRIVATE_KEY
  const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
  if (!adminPrivateKey) {
    throw new AppError(500, 'ADMIN_PRIVATE_KEY is not configured on this server');
  }
  const adminKeypair = Keypair.fromSecret(adminPrivateKey);
  const signaturePayload = Buffer.from(`${market_id}:${outcome}`, 'utf8');
  const admin_signature = Buffer.from(adminKeypair.sign(signaturePayload)).toString('hex');

  // Step 3: Retrieve market to get match_id
  const market = await db().findMarketById(market_id);
  if (!market) {
    throw new AppError(404, `Market not found: ${market_id}`);
  }

  // Step 4: Call OracleService.adminOverrideResult
  const tx_hash = await OracleService.adminOverrideResult(
    market.match_id,
    outcome as OracleService.FightOutcome,
    admin_signature,
  );

  // Step 5: Update market status to 'resolved' in DB
  await db().updateMarketStatus(market_id, 'resolved');

  res.status(200).json({ tx_hash: tx_hash ?? 'admin-override-completed' });
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
