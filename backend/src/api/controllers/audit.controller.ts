import { Request, Response, NextFunction } from "express";
import * as auditService from "../../services/audit.service";

/**
 * GET /api/admin/audit-logs
 * Get audit logs with pagination and filtering
 * Query params:
 *   - page: number (default 1)
 *   - limit: number (default 20, max 100)
 *   - userId: string (filter by user ID)
 *   - actionType: string (filter by action type / path)
 *   - startDate: ISO date string (filter by start date)
 *   - endDate: ISO date string (filter by end date)
 */
export async function getAuditLogsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { page, limit, userId, actionType, startDate, endDate } = req.query;

    const query: Parameters<typeof auditService.getAuditLogs>[0] = {
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      userId: userId ? String(userId) : undefined,
      actionType: actionType ? String(actionType) : undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    };

    // Validate dates if provided
    if (query.startDate && isNaN(query.startDate.getTime())) {
      res.status(400).json({ error: "Invalid startDate format. Use ISO date string." });
      return;
    }
    if (query.endDate && isNaN(query.endDate.getTime())) {
      res.status(400).json({ error: "Invalid endDate format. Use ISO date string." });
      return;
    }

    const result = await auditService.getAuditLogs(query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
