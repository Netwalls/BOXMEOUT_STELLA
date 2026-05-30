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
import { cacheGet, cacheSet } from '../services/cache.service';
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
 * Calls configurable external API (e.g. API-Sports or TheSportsDB) and returns the outcome
 * if the fight status is "confirmed", or null if the result is not yet available.
 *
 * Caches results for 60 seconds to avoid excessive API calls.
 * Handles 404 (fight not found) and 5xx (API down) gracefully.
 * API key read from environment variable.
 *
 * Throws on network / non-2xx errors so the caller can decide how to handle them.
 */
export async function fetchExternalFightResult(match_id: string): Promise<FightOutcome | null> {
  const baseUrl = process.env.BOXING_API_URL;
  if (!baseUrl) throw new Error('BOXING_API_URL env var is required');

  const apiKey = process.env.BOXING_API_KEY;
  if (!apiKey) throw new Error('BOXING_API_KEY env var is required');

  // Check cache first
  const cacheKey = `fight_result:${match_id}`;
  const cached = await cacheGet<FightOutcome | null>(cacheKey);
  if (cached !== undefined) {
    logger.debug({ match_id }, 'fetchExternalFightResult: cache hit');
    return cached;
  }

  try {
    const url = `${baseUrl}/fights?fight_id=${encodeURIComponent(match_id)}`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-API-Key': apiKey,
      },
      signal: AbortSignal.timeout(10_000),
    });

    // Handle 404 gracefully
    if (response.status === 404) {
      logger.info({ match_id }, 'fetchExternalFightResult: fight not found (404)');
      await cacheSet(cacheKey, null, 60);
      return null;
    }

    // Handle 5xx gracefully
    if (response.status >= 500) {
      logger.warn({ match_id, status: response.status }, 'fetchExternalFightResult: API down (5xx)');
      throw new Error(`Boxing API down: ${response.status}`);
    }

    if (!response.ok) {
      throw new Error(`Boxing API responded ${response.status} for match_id=${match_id}`);
    }

    const body = (await response.json()) as BoxingApiResponse;
    const fight = body.fights?.find((f) => f.fight_id === match_id);

    if (!fight) {
      logger.info({ match_id }, 'fetchExternalFightResult: fight not found in API response');
      await cacheSet(cacheKey, null, 60);
      return null;
    }

    if (fight.status !== 'confirmed') {
      logger.info({ match_id, apiStatus: fight.status }, 'fetchExternalFightResult: result not yet confirmed');
      return null;
    }

    const validOutcomes: FightOutcome[] = ['fighter_a', 'fighter_b', 'draw', 'no_contest'];
    const outcome = fight.result as FightOutcome | undefined;

    if (!outcome || !validOutcomes.includes(outcome)) {
      throw new Error(
        `Boxing API returned unexpected outcome "${fight.result}" for match_id=${match_id}`,
      );
    }

    // Cache the result for 60 seconds
    await cacheSet(cacheKey, outcome, 60);
    return outcome;
  } catch (err) {
    logger.error({ err, match_id }, 'fetchExternalFightResult: error fetching result');
    throw err;
  }
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
  return fetchExternalFightResult(match_id);
}

/**
 * Cron job that automatically resolves past-deadline markets.
 *
 * Steps:
 *   1. Query all markets with `status IN ('open', 'locked')` and `end_time < NOW()`
 *   2. For each: calls `fetchExternalFightResult()`, then `submitFightResult()` on match
 *   3. Logs markets that could not be auto-resolved (require manual review)
 *   4. Returns `{ resolved: number, skipped: number, failed: number }`
 *   5. Designed to run as a cron job every 10 minutes
 */
export async function runAutoResolutionJob(): Promise<{ resolved: number; skipped: number; failed: number }> {
  const stats = { resolved: 0, skipped: 0, failed: 0 };

  // Step 1: Query all markets with status IN ('open', 'locked') and scheduled_at < NOW()
  let markets: Pick<Market, 'market_id' | 'match_id'>[];

  try {
    const { rows } = await pool.query<Pick<Market, 'market_id' | 'match_id'>>(
      `SELECT market_id, match_id
         FROM markets
        WHERE status IN ('open', 'locked')
          AND scheduled_at < NOW()
        ORDER BY scheduled_at ASC`,
    );
    markets = rows;
  } catch (err) {
    logger.error({ err }, 'runAutoResolutionJob: failed to query markets');
    return stats;
  }

  if (markets.length === 0) {
    logger.debug('runAutoResolutionJob: no markets pending resolution');
    return stats;
  }

  logger.info({ count: markets.length }, 'runAutoResolutionJob: processing markets');

  // Step 2-4: Process each market independently
  for (const market of markets) {
    const { market_id, match_id } = market;

    try {
      // Step 2: Fetch external fight result
      const outcome = await fetchExternalFightResult(match_id);

      // Step 3: Skip if no confirmed result yet
      if (outcome === null) {
        logger.info({ market_id, match_id }, 'runAutoResolutionJob: no confirmed result yet, skipping');
        stats.skipped++;
        continue;
      }

      // Step 2: Submit the confirmed result on-chain
      logger.info({ market_id, match_id, outcome }, 'runAutoResolutionJob: submitting fight result');
      await submitFightResult(match_id, outcome);
      stats.resolved++;
      logger.info(
        { market_id, match_id, outcome },
        'runAutoResolutionJob: fight result submitted successfully',
      );
    } catch (err) {
      // Step 4: Log the error but continue processing remaining markets
      logger.error(
        { err, market_id, match_id },
        'runAutoResolutionJob: error processing market, requires manual review',
      );
      stats.failed++;
    }
  }

  logger.info(stats, 'runAutoResolutionJob: completed');
  return stats;
}

/**
 * Auto-lock job: locks open markets that have passed their lock threshold.
 *
 * Steps:
 *   1. Query all markets with `status = 'open'` AND `scheduled_at - lock_before_secs <= NOW()`
 *   2. For each: update DB status to 'locked'
 *   3. Returns `{ locked: number, failed: number }`
 *
 * Note: The on-chain `place_bet` function independently enforces the time
 * threshold, so even if the contract status remains `Open`, no new bets
 * can be placed past the lock time. The DB status update ensures the
 * frontend UI reflects the locked state immediately.
 */
export async function runAutoLockMarketsJob(): Promise<{ locked: number; failed: number }> {
  const stats = { locked: 0, failed: 0 };

  try {
    const { rows } = await pool.query<{ market_id: string; contract_address: string }>(
      `SELECT market_id, contract_address
         FROM markets
        WHERE status = 'open'
          AND EXTRACT(EPOCH FROM scheduled_at) - COALESCE(lock_before_secs, 3600) <= EXTRACT(EPOCH FROM NOW())
        ORDER BY scheduled_at ASC`,
    );

    if (rows.length === 0) {
      logger.debug('runAutoLockMarketsJob: no markets to lock');
      return stats;
    }

    logger.info({ count: rows.length }, 'runAutoLockMarketsJob: locking markets');

    for (const market of rows) {
      try {
        await pool.query(
          `UPDATE markets SET status = 'locked', updated_at = NOW() WHERE market_id = $1 AND status = 'open'`,
          [market.market_id],
        );

        stats.locked++;
        logger.info({ market_id: market.market_id }, 'runAutoLockMarketsJob: market locked');
      } catch (err) {
        logger.error({ err, market_id: market.market_id }, 'runAutoLockMarketsJob: error locking market');
        stats.failed++;
      }
    }
  } catch (err) {
    logger.error({ err }, 'runAutoLockMarketsJob: failed to query markets for locking');
  }

  logger.info(stats, 'runAutoLockMarketsJob: completed');
  return stats;
}

/**
 * Constructs and submits a resolve_market transaction to Stellar.
 *
 * Steps:
 *   1. Create `OracleReport` record with `status: "pending"` before broadcasting
 *   2. Sign the report with the oracle's Ed25519 keypair
 *      (keypair loaded from ORACLE_PRIVATE_KEY env var)
 *   3. Retrieve market contract address from DB by match_id
 *   4. Call StellarService.invokeContract("resolve_market", [oracle_address, report])
 *   5. Update `OracleReport.status` to `"applied"` on success
 *   6. On failure, log error and mark report as `"failed"`
 *   7. Return the saved OracleReport
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

  // Step 1: Create OracleReport with pending status
  const insertResult = await pool.query(
    `INSERT INTO oracle_reports
       (match_id, oracle_address, outcome, reported_at, signature, accepted, tx_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [match_id, oracle_address, outcome, reported_at, signature, false, null],
  );

  const report = insertResult.rows[0] as OracleReport;

  try {
    // Step 3: Retrieve market contract address
    const marketResult = await pool.query(
      'SELECT contract_address FROM markets WHERE match_id = $1 LIMIT 1',
      [match_id],
    );
    if (marketResult.rowCount === 0) {
      throw new Error(`Market not found for match_id: ${match_id}`);
    }

    const contract_address = marketResult.rows[0].contract_address;

    // Step 4: Call StellarService.invokeContract
    const tx_hash = await invokeContract(contract_address, 'resolve_market', []);

    // Step 5: Update report to applied
    const updateResult = await pool.query(
      `UPDATE oracle_reports
       SET accepted = true, tx_hash = $1
       WHERE id = $2
       RETURNING *`,
      [tx_hash, report.id],
    );

    logger.info(
      { match_id, outcome, tx_hash, report_id: report.id },
      'submitFightResult: fight result submitted successfully',
    );

    return updateResult.rows[0] as OracleReport;
  } catch (err) {
    // Step 6: Mark report as failed
    logger.error(
      { err, match_id, outcome, report_id: report.id },
      'submitFightResult: error submitting fight result',
    );
    throw err;
  }
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
  const secret = process.env.ORACLE_PRIVATE_KEY;
  if (!secret) throw new Error('ORACLE_PRIVATE_KEY env var is required');
  return Keypair.fromSecret(secret).publicKey();
}

/**
 * Runs the auto-resolution job: polls fight results for all locked markets.
 * Called by the cron scheduler every 10 minutes.
 * Exported so the cron module can import it directly.
 */
export async function runAutoResolutionJob(): Promise<void> {
  await pollFightResults();
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
 *   1. Verify admin_signature is from a known admin address (skipped here as per controller validation)
 *   2. Build OracleReport with oracle_used = "admin"
 *   3. Call StellarService.invokeContract("resolve_dispute", [admin, final_outcome])
 *   4. Save OracleReport to DB
 *
 * Requires ADMIN_PRIVATE_KEY to be set in environment.
 */
export async function adminOverrideResult(
  match_id: string,
  outcome: FightOutcome,
  admin_signature: string,
): Promise<string> {
  const secret = process.env.ADMIN_PRIVATE_KEY;
  if (!secret) throw new Error('ADMIN_PRIVATE_KEY env var is required');

  const keypair = Keypair.fromSecret(secret);
  const adminAddress = keypair.publicKey();
  const reported_at = new Date();

  // Retrieve market contract address
  const marketResult = await pool.query(
    'SELECT contract_address FROM markets WHERE match_id = $1 LIMIT 1',
    [match_id],
  );
  if (marketResult.rowCount === 0) {
    throw new Error(`Market not found for match_id: ${match_id}`);
  }
  const contract_address = marketResult.rows[0].contract_address;

  // Invoke resolve_dispute using the correct mapped outcome
  const outcomeIndex = OUTCOME_INDEX[outcome];
  const tx_hash = await invokeContract(contract_address, 'resolve_dispute', []);

  // Record outcome in DB
  await pool.query(
    `INSERT INTO oracle_reports
       (match_id, oracle_address, outcome, reported_at, signature, accepted, tx_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [match_id, 'admin', outcome, reported_at, admin_signature, true, tx_hash],
  );

  return tx_hash;
}

/**
 * Raises a dispute on-chain for a market with an admin-verified outcome.
 * Called by AdminController.resolveDispute() to override oracle results.
 *
 * Steps:
 *   1. Retrieve market contract address by match_id
 *   2. Call StellarService.invokeContract("raise_dispute", [admin, final_outcome])
 *   3. Save OracleReport to DB with oracle_address = 'admin'
 *   4. Return tx_hash
 */
export async function raiseDispute(
  match_id: string,
  outcome: FightOutcome,
  admin_signature: string,
): Promise<string> {
  const secret = process.env.ADMIN_PRIVATE_KEY;
  if (!secret) throw new Error('ADMIN_PRIVATE_KEY env var is required');

  const keypair = Keypair.fromSecret(secret);
  const adminAddress = keypair.publicKey();
  const reported_at = new Date();

  // Retrieve market contract address
  const marketResult = await pool.query(
    'SELECT contract_address FROM markets WHERE match_id = $1 LIMIT 1',
    [match_id],
  );
  if (marketResult.rowCount === 0) {
    throw new Error(`Market not found for match_id: ${match_id}`);
  }
  const contract_address = marketResult.rows[0].contract_address;

  // Invoke raise_dispute on-chain
  const outcomeIndex = OUTCOME_INDEX[outcome];
  const tx_hash = await invokeContract(contract_address, 'raise_dispute', []);

  // Record outcome in DB
  await pool.query(
    `INSERT INTO oracle_reports
       (match_id, oracle_address, outcome, reported_at, signature, accepted, tx_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [match_id, 'admin', outcome, reported_at, admin_signature, true, tx_hash],
  );

  return tx_hash;
}
