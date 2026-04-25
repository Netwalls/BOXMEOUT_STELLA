// ============================================================
// BOXMEOUT — Oracle Service
// Responsible for fetching fight results from external sources
// and submitting them to Market contracts on Stellar.
// Contributors: implement every function marked TODO.
// ============================================================

import { verify as cryptoVerify, createPublicKey } from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { pool } from '../config/db';
import { invokeContract } from '../services/StellarService';
import type { OracleReport } from '../models/OracleReport';

export type FightOutcome = 'fighter_a' | 'fighter_b' | 'draw' | 'no_contest';

const OUTCOME_INDEX: Record<FightOutcome, number> = {
  fighter_a: 0,
  fighter_b: 1,
  draw: 2,
  no_contest: 3,
};

// ─── Whitelist cache ──────────────────────────────────────────────────────────

let whitelistCache: Set<string> | null = null;
let whitelistFetchedAt = 0;
const WHITELIST_TTL_MS = 5 * 60 * 1000;

async function getOracleWhitelist(): Promise<Set<string>> {
  if (whitelistCache && Date.now() - whitelistFetchedAt < WHITELIST_TTL_MS) {
    return whitelistCache;
  }
  // TODO: replace with real DB/contract query for oracle whitelist
  const addresses: string[] = process.env.ORACLE_WHITELIST
    ? process.env.ORACLE_WHITELIST.split(',').map((s) => s.trim())
    : [];
  whitelistCache = new Set(addresses);
  whitelistFetchedAt = Date.now();
  return whitelistCache;
}

/**
 * Polls external boxing data sources for confirmed fight results.
 *
 * Called on a cron schedule — every 5 minutes after a fight's scheduled_at.
 *
 * Steps:
 *   1. Query DB for markets with status = "locked" and scheduled_at < now
 *   2. For each, call fetchPrimaryResult(match_id)
 *   3. If result found and confirmed, call submitFightResult(match_id, outcome)
 *   4. Log failures but do not throw — continue to next market
 */
export async function pollFightResults(): Promise<void> {
  // TODO: implement
}

/**
 * Constructs and submits a resolve_market transaction to Stellar.
 *
 * Steps:
 *   1. Build OracleReport: { match_id, outcome, reported_at: now }
 *   2. Sign the report with the oracle's Ed25519 keypair
 *      (keypair loaded from ORACLE_PRIVATE_KEY env var)
 *   3. Retrieve market contract address from DB by match_id
 *   4. Call StellarService.invokeContract("resolve_market", [oracle_address, report])
 *   5. Save OracleReport to DB with accepted = true
 *   6. Return the saved OracleReport
 */
export async function submitFightResult(
  match_id: string,
  outcome: FightOutcome,
): Promise<OracleReport> {
  const secret = process.env.ORACLE_PRIVATE_KEY;
  if (!secret) throw new Error('ORACLE_PRIVATE_KEY env var is required');

  const keypair = Keypair.fromSecret(secret);
  const oracle_address = keypair.publicKey();
  const reported_at = new Date();

  const outcomeIndex = OUTCOME_INDEX[outcome];
  if (outcomeIndex === undefined) throw new Error(`Invalid fight outcome: ${outcome}`);

  const tsBuf = Buffer.alloc(8);
  tsBuf.writeBigInt64BE(BigInt(reported_at.getTime()));
  const message = Buffer.concat([
    Buffer.from(match_id, 'utf8'),
    Buffer.from([outcomeIndex]),
    tsBuf,
  ]);

  const signature = Buffer.from(keypair.sign(message)).toString('hex');

  const marketResult = await pool.query(
    'SELECT contract_address FROM markets WHERE match_id = $1 LIMIT 1',
    [match_id],
  );
  if (marketResult.rowCount === 0) {
    throw new Error(`Market not found for match_id: ${match_id}`);
  }

  const contract_address = marketResult.rows[0].contract_address;
  const tx_hash = await invokeContract(contract_address, 'resolve_market', [] as unknown[]);

  const insertResult = await pool.query(
    `INSERT INTO oracle_reports
       (match_id, oracle_address, outcome, reported_at, signature, accepted, tx_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [match_id, oracle_address, outcome, reported_at, signature, true, tx_hash],
  );

  return insertResult.rows[0] as OracleReport;
}

/**
 * Verifies the authenticity of an OracleReport.
 *
 * Steps:
 *   1. Reconstruct the signed message: Buffer.concat([match_id, outcome, reported_at])
 *   2. Verify report.signature using Ed25519 against oracle_address public key
 *   3. Check oracle_address is in current oracle whitelist (DB cache or factory read)
 *
 * Returns true if valid, false otherwise. Never throws.
 */
export async function verifyOracleReport(report: OracleReport): Promise<boolean> {
  try {
    // 1. Reconstruct signed message
    const outcomeIndex = OUTCOME_INDEX[report.outcome as FightOutcome];
    if (outcomeIndex === undefined) return false;

    const reportedAtMs = BigInt(new Date(report.reported_at).getTime());
    const tsBuf = Buffer.alloc(8);
    tsBuf.writeBigInt64BE(reportedAtMs);

    const message = Buffer.concat([
      Buffer.from(report.match_id),
      Buffer.from([outcomeIndex]),
      tsBuf,
    ]);

    // 2. Verify Ed25519 signature
    const rawPubKey = Keypair.fromPublicKey(report.oracle_address).rawPublicKey();
    const pubKeyObj = createPublicKey({
      key: Buffer.concat([
        // Ed25519 SubjectPublicKeyInfo DER prefix (12 bytes)
        Buffer.from('302a300506032b6570032100', 'hex'),
        rawPubKey,
      ]),
      format: 'der',
      type: 'spki',
    });

    const sigBuf = Buffer.from(report.signature, 'hex');
    const sigValid = cryptoVerify(null, message, pubKeyObj, sigBuf);
    if (!sigValid) return false;

    // 3. Check whitelist
    const whitelist = await getOracleWhitelist();
    return whitelist.has(report.oracle_address);
  } catch {
    return false;
  }
}

/**
 * Returns the oracle's Stellar G... public address derived from ORACLE_PRIVATE_KEY.
 * Used by the frontend to identify which oracle resolved a market.
 */
export function getOraclePublicKey(): string {
  // TODO: implement
  throw new Error('Not implemented');
}

/**
 * Queries a secondary boxing data source (fallback oracle) for a fight result.
 * Used when the primary source is unavailable or returns conflicting data.
 * Returns the outcome string if found, null if the result is not yet available.
 */
export async function fetchFallbackResult(
  _match_id: string,
): Promise<FightOutcome | null> {
  // TODO: implement
  throw new Error('Not implemented');
}

/**
 * Admin manual override for fight result resolution.
 * Used during dispute resolution when automated oracles are wrong.
 *
 * Steps:
 *   1. Verify admin_signature is from a known admin address
 *   2. Build OracleReport with oracle_used = "admin"
 *   3. Call StellarService.invokeContract("resolve_dispute", [admin, final_outcome])
 *   4. Save OracleReport to DB
 *
 * Requires ADMIN_PRIVATE_KEY to be set in environment.
 */
export async function adminOverrideResult(
  _match_id: string,
  _outcome: FightOutcome,
  _admin_signature: string,
): Promise<void> {
  // TODO: implement
}
