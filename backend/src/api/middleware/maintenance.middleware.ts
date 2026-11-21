/**
 * B-160: while maintenance mode is on, non-GET requests get 503 with
 * Retry-After. Reads keep working.
 *
 * Exempt, so the service stays observable and recoverable:
 *   - GET/HEAD/OPTIONS (reads)
 *   - /health, /ready, /metrics (probes and scraping)
 *   - POST /api/admin/maintenance (so an admin can always turn the flag off)
 */
import type { NextFunction, Request, Response } from "express";
import { config } from "../../config";
import { logger } from "../../logger";
import { fail } from "../response";
import {
  ADMIN_MAINTENANCE_PATH,
  MAINTENANCE_RETRY_AFTER_SECONDS,
  getMaintenanceState,
} from "../../services/maintenance.service";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const EXEMPT_PATHS = new Set(["/health", "/ready", "/metrics", ADMIN_MAINTENANCE_PATH]);

export function isMaintenanceExempt(method: string, path: string): boolean {
  return READ_METHODS.has(method.toUpperCase()) || EXEMPT_PATHS.has(path);
}

export interface MaintenanceMiddlewareOptions {
  /** Overrides the state lookup. Tests use this. */
  isEnabled?: () => Promise<boolean>;
}

export function maintenanceMiddleware(options: MaintenanceMiddlewareOptions = {}) {
  const isEnabled = options.isEnabled ?? (async () => (await getMaintenanceState()).enabled);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (isMaintenanceExempt(req.method, req.path)) {
      next();
      return;
    }

    let enabled: boolean;
    try {
      enabled = await isEnabled();
    } catch (err) {
      // Redis unreachable: fall back to the env override so writes still stop
      // when it is set. The Redis flag cannot be read here.
      logger.warn({ err }, "maintenance state unavailable; using env override only");
      enabled = config.MAINTENANCE_MODE;
    }

    if (!enabled) {
      next();
      return;
    }

    res.setHeader("Retry-After", String(MAINTENANCE_RETRY_AFTER_SECONDS));
    fail(res, 503, "MAINTENANCE_MODE", "The service is in read-only maintenance mode. Try again later.");
  };
}
