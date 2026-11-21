/**
 * Admin handlers for failed oracle result submission jobs (#1257).
 *   GET  /api/admin/oracle-submissions/failed       -> list failed jobs
 *   POST /api/admin/oracle-submissions/:id/retry    -> retry one job
 */
import type { Request, Response } from "express";
import { logger } from "../../logger";
import {
  listFailedOracleSubmissions,
  retryFailedOracleSubmission,
} from "../../services/resolution.service";
import { fail, ok } from "../response";

export async function getFailedSubmissionsHandler(_req: Request, res: Response): Promise<void> {
  try {
    ok(res, await listFailedOracleSubmissions());
  } catch (err) {
    logger.error({ err }, "getFailedSubmissionsHandler failed");
    fail(res, 500, "INTERNAL_ERROR", "Failed to list failed oracle submissions");
  }
}

export async function retryFailedSubmissionHandler(req: Request, res: Response): Promise<void> {
  try {
    await retryFailedOracleSubmission(req.params.id);
    ok(res, { id: req.params.id, status: "retried" });
  } catch (err) {
    logger.error({ err, jobId: req.params.id }, "retryFailedSubmissionHandler failed");
    fail(res, 500, "INTERNAL_ERROR", "Failed to retry oracle submission");
  }
}
