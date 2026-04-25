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
import { logger } from '../utils/logger';
import type { OracleReport } from '../models/OracleReport';
import type { Market } from '../models/Market';

export type FightOutcome = 'fighter_a' | 'fighter_b' | 'draw' | 'no_contest';

// Shape of a single fight entry returned by the external boxing API
interface BoxingApiFight {
  fight_id: string;
  status: string;          // e.g. "confirmed", "pending", "cancelled"
  result?: string;         // e.g. "fighter_a", "fighter_b", "draw", "no_contest"
}

interface BoxingApiResponse {
  fights: BoxingApiFight[];
}

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
 * Fetches a confirmed fight result from the external boxing data API.
 *
 * Calls BOXING_API_URL/fights?fight_id=<match_id> and returns the outcome
 * if the fight status is "confirmed", or null if the result is not yet available.
 *
 * Throws on network / non-2xx errors so the caller can decide how to handle them.
 */
export async function fetchPrimaryResult(match_id: string): Promise<FightOutcome | null> {
  const baseUrl = process.env.BOXING_API_URL;
  if (!baseUrl) throw new Error('BOXING_API_URL env var is required');

  const url = `${baseUrl}/fights?fight_id=${encodeURIComponent(match_id)}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000), // 10 s hard timeout
  });

  if (!response.ok) {
    throw new Error(`Boxing API responded ${response.status} for match_id=${match_id}`);
  }

  const body = (await response.json()) as BoxingApiResponse;
  const fight = body.fights?.find((f) => f.fight_id === match_id);

  if (!fight) {
    logger.info({ match_id }, 'pollFightResults: fight not found in API response');
    return null;
  }

  if (fight.status !== 'confirmed') {
    logger.info({ match_id, apiStatus: fight.status }, 'pollFightResults: result not yet confirmed');
    return null;
  }

  const validOutcomes: FightOutcome[] = ['fighter_a', 'fighter_b', 'draw', 'no_contest'];
  const outcome = fight.result as FightOutcome | undefined;

  if (!outcome || !validOutcomes.includes(outcome)) {
    throw new Error(
      `Boxing API returned unexpected outcome "${fight.result}" for match_id=${match_id}`,
    );
  }

  return outcome;
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
  // ── Step 1: fetch all locked markets whose fight time has passed ──────────
  let markets: Pick<Market, 'market_id' | 'match_id'>[];

  try {
    const { rows } = await pool.query<Pick<Market, 'market_id' | 'match_id'>>(
      `SELECT market_id, match_id
         FROM markets
        WHERE status = 'locked'
          AND scheduled_at < NOW()
        ORDER BY scheduled_at ASC`,
    );
    markets = rows;
  } catch (err) {
    // DB failure is fatal for this poll cycle — log and bail out entirely
    logger.error({ err }, 'pollFightResults: failed to query locked markets');
    return;
  }

  if (markets.length === 0) {
    logger.debug('pollFightResults: no locked markets pending resolution');
    return;
  }

  logger.info({ count: markets.length }, 'pollFightResults: processing locked markets');

  // ── Step 2-4: process each market independently ───────────────────────────
  for (const market of markets) {
    const { market_id, match_id } = market;

    try {
      // Step 2: call the external boxing API
      const outcome = await fetchPrimaryResult(match_id);

      // Step 3: skip if no confirmed result yet
      if (outcome === null) {
        logger.info({ market_id, match_id }, 'pollFightResults: no confirmed result yet, skipping');
        continue;
      }

      // Step 3: submit the confirmed result on-chain and persist to DB
      logger.info({ market_id, match_id, outcome }, 'pollFightResults: submitting fight result');
      const report = await submitFightResult(match_id, outcome);
      logger.info(
        { market_id, match_id, outcome, tx_hash: report.tx_hash, report_id: report.id },
        'pollFightResults: fight result submitted successfully',
      );
    } catch (err) {
      // Step 4: log the error but continue processing remaining markets
      logger.error(
        { err, market_id, match_id },
        'pollFightResults: error processing market, skipping to next',
      );
    }
  }
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
