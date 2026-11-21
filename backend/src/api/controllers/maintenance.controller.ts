/**
 * B-160: admin endpoints for maintenance mode.
 *   GET  /api/admin/maintenance  -> current state
 *   POST /api/admin/maintenance  -> body { enabled: boolean, reason?: string }
 * Both sit behind adminAuth. The POST path is exempt from the maintenance block.
 */
import type { Request, Response } from "express";
import { z } from "zod";
import { logger } from "../../logger";
import {
  ADMIN_AUDIT_ACTOR,
  getMaintenanceState,
  setMaintenanceMode,
} from "../../services/maintenance.service";
import { fail, ok } from "../response";

export const setMaintenanceSchema = z
  .object({
    enabled: z.boolean({ required_error: "enabled is required", invalid_type_error: "enabled must be a boolean" }),
    reason: z.string().trim().max(200, "reason must be at most 200 characters").optional(),
  })
  .strict();

export async function getMaintenanceHandler(_req: Request, res: Response): Promise<void> {
  try {
    ok(res, await getMaintenanceState());
  } catch (err) {
    logger.error({ err }, "getMaintenanceHandler failed");
    fail(res, 500, "INTERNAL_ERROR", "Failed to read maintenance state");
  }
}

export async function setMaintenanceHandler(req: Request, res: Response): Promise<void> {
  const parsed = setMaintenanceSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    fail(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid request", {
      details: parsed.error.flatten(),
    });
    return;
  }

  try {
    const state = await setMaintenanceMode({
      enabled: parsed.data.enabled,
      reason: parsed.data.reason ?? null,
      actor: ADMIN_AUDIT_ACTOR,
      ipAddress: req.ip ?? req.socket.remoteAddress ?? "unknown",
    });
    logger.info({ enabled: parsed.data.enabled }, "maintenance mode updated");
    ok(res, state);
  } catch (err) {
    logger.error({ err }, "setMaintenanceHandler failed");
    fail(res, 500, "INTERNAL_ERROR", "Failed to update maintenance mode");
  }
}
