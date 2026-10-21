import { Request, Response, NextFunction } from "express";
import * as auditService from "../../services/audit.service";
import { ok, fail } from "../response";

/**
 * GET /api/admin/audit-logs
 * Get audit logs with pagination and filtering
 * Query params:
 *   - page: number (default 1)
 *   - limit: number (default 20, max 100)
 *   - userId: string (filter by user ID)
 *   - actor: string (filter by authenticated actor identity)
 *   - actionType: string (filter by action type / path)
 *   - action: string (filter by action)
 *   - startDate: ISO date string (filter by start date)
 *   - endDate: ISO date string (filter by end date)
 */
export async function getAuditLogsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { page, limit, userId, actor, actionType, action, startDate, endDate } =
      req.query;

    const query: Parameters<typeof auditService.getAuditLogs>[0] = {
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      userId: userId ? String(userId) : undefined,
      actor: actor ? String(actor) : undefined,
      actionType: actionType ? String(actionType) : undefined,
      action: action ? String(action) : undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    };

    // Validate dates if provided
    if (query.startDate && isNaN(query.startDate.getTime())) {
      fail(res, 400, "VALIDATION_ERROR", "Invalid startDate format. Use ISO date string.");
      return;
    }
    if (query.endDate && isNaN(query.endDate.getTime())) {
      fail(res, 400, "VALIDATION_ERROR", "Invalid endDate format. Use ISO date string.");
      return;
    }

    const { logs, pagination } = await auditService.getAuditLogs(query);
    ok(res, logs, { meta: { pagination } });
  } catch (err) {
    next(err);
  }
}
