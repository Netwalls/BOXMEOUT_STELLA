/**
 * B-160: maintenance (read-only) mode.
 *
 * The flag lives in Redis under MAINTENANCE_KEY. Turning it on or off through
 * the admin endpoint writes an AuditLog row. The MAINTENANCE_MODE env var
 * forces maintenance on regardless of the Redis flag, for use when Redis or
 * the admin API is itself unavailable. The admin endpoint cannot clear the env
 * override.
 */
import { config } from "../config";
import { db } from "../db";
import { logger } from "../logger";
import { redis } from "../lib/redis";
import { withTimeout } from "../lib/timeout";

export const MAINTENANCE_KEY = "maintenance:mode";
export const MAINTENANCE_RETRY_AFTER_SECONDS = 60;
export const ADMIN_MAINTENANCE_PATH = "/api/admin/maintenance";
export const ADMIN_AUDIT_ACTOR = "admin";

/** Upper bound on the Redis lookup so a dropped connection cannot hang requests. */
const REDIS_LOOKUP_TIMEOUT_MS = 500;

export interface MaintenanceState {
  enabled: boolean;
  /** "env" when MAINTENANCE_MODE forces it on, "admin" when the Redis flag is set. */
  source: "env" | "admin" | null;
  reason: string | null;
  since: string | null;
  actor: string | null;
}

interface StoredFlag {
  reason: string | null;
  since: string;
  actor: string;
}

const OFF: MaintenanceState = { enabled: false, source: null, reason: null, since: null, actor: null };

/**
 * Current maintenance state. The env override wins. Otherwise the Redis flag
 * decides. Throws if Redis does not answer within REDIS_LOOKUP_TIMEOUT_MS.
 */
export async function getMaintenanceState(): Promise<MaintenanceState> {
  if (config.MAINTENANCE_MODE) {
    return { ...OFF, enabled: true, source: "env", reason: "MAINTENANCE_MODE is set" };
  }

  const raw = await withTimeout(redis.get(MAINTENANCE_KEY), REDIS_LOOKUP_TIMEOUT_MS, "maintenance lookup");
  if (!raw) return OFF;

  try {
    const stored = JSON.parse(raw) as StoredFlag;
    return { enabled: true, source: "admin", reason: stored.reason, since: stored.since, actor: stored.actor };
  } catch {
    // A flag we cannot read is treated as on, so a corrupt value fails safe.
    logger.warn({ key: MAINTENANCE_KEY }, "unreadable maintenance flag; treating as enabled");
    return { ...OFF, enabled: true, source: "admin" };
  }
}

export interface SetMaintenanceInput {
  enabled: boolean;
  actor: string;
  reason?: string | null;
  ipAddress: string;
}

/**
 * Sets or clears the Redis flag and writes an AuditLog row for the change.
 * If the audit write fails, the flag is restored to its previous value and the
 * error is re-thrown, so a change never happens without an audit entry.
 */
export async function setMaintenanceMode(input: SetMaintenanceInput): Promise<MaintenanceState> {
  const previous = await withTimeout(redis.get(MAINTENANCE_KEY), REDIS_LOOKUP_TIMEOUT_MS, "maintenance lookup");
  const reason = input.reason ?? null;

  if (input.enabled) {
    const flag: StoredFlag = { reason, since: new Date().toISOString(), actor: input.actor };
    await redis.set(MAINTENANCE_KEY, JSON.stringify(flag));
  } else {
    await redis.del(MAINTENANCE_KEY);
  }

  try {
    await db.auditLog.create({
      data: {
        userId: input.actor,
        ipAddress: input.ipAddress,
        method: "POST",
        path: ADMIN_MAINTENANCE_PATH,
        requestBody: {
          action: input.enabled ? "MAINTENANCE_ENABLED" : "MAINTENANCE_DISABLED",
          enabled: input.enabled,
          reason,
        },
        statusCode: 200,
      },
    });
  } catch (err) {
    if (previous === null) {
      await redis.del(MAINTENANCE_KEY);
    } else {
      await redis.set(MAINTENANCE_KEY, previous);
    }
    throw err;
  }

  return getMaintenanceState();
}
