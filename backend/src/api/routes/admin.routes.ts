import { Router } from "express";
import {
  getPendingResolutionsHandler,
  resolveDisputeHandler,
} from "../controllers/market.controller";
import {
  resolveMarketByIdHandler,
  resolveMarketHandler,
} from "../controllers/marketResolution.controller";
import {
  getAllOraclesHandler,
  createOracleHandler,
  updateOracleHandler,
  deleteOracleHandler,
} from "../controllers/oracle.controller";
import { getAuditLogsHandler } from "../controllers/audit.controller";
import { reconcileMarketHandler } from "../controllers/market-reconciliation.controller";
import {
  getFailedSubmissionsHandler,
  retryFailedSubmissionHandler,
} from "../controllers/oracleSubmission.controller";
import { rateLimitMiddleware } from "../middleware/rateLimit.middleware";
import { adminAuth } from "../middleware/adminAuth";
import { auditLogMiddleware } from "../middleware/audit-log.middleware";

const router = Router();

// #1219: All /api/admin/* routes require Bearer ADMIN_API_KEY authentication.
router.use(adminAuth);

// #1258: Record verified actor, action, target id and a redacted JSON diff
// for admin mutations (resolve/dispute/oracle changes).
router.use(auditLogMiddleware);

// Market resolution is high-stakes and infrequent — tight limit.
const marketResolutionLimiter = rateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 10,
  keyPrefix: "admin:markets:write",
});

// Oracle CRUD is lower-stakes admin bookkeeping — looser limit.
const oracleWriteLimiter = rateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 30,
  keyPrefix: "admin:oracles:write",
});

// #1257: Oracle result submission retry/idempotency admin surface.
const oracleSubmissionLimiter = rateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 30,
  keyPrefix: "admin:oracle-submissions:write",
});

// Market management
router.get("/markets/pending", getPendingResolutionsHandler);
// Registered before "/markets/:marketId/resolve" so "dispute" is not captured as a market id.
router.post("/markets/dispute/resolve", marketResolutionLimiter, resolveDisputeHandler);
// #1412: reconcile one market against on-chain state (report-only unless autoRepair).
router.post("/markets/:id/reconcile", reconcileMarketHandler);

// Oracle address management (Issue #455)
router.get("/oracles", getAllOraclesHandler);
router.post("/oracles", oracleWriteLimiter, createOracleHandler);
router.patch("/oracles/:id", oracleWriteLimiter, updateOracleHandler);
router.delete("/oracles/:id", oracleWriteLimiter, deleteOracleHandler);

// Oracle result submission jobs (Issue #1257)
router.get("/oracle-submissions/failed", getFailedSubmissionsHandler);
router.post(
  "/oracle-submissions/:id/retry",
  oracleSubmissionLimiter,
  retryFailedSubmissionHandler,
);

// Audit logging (Issue #456, #1258)
// Supports ?actor=<id>&action=<action> filtering.
router.get("/audit-logs", getAuditLogsHandler);

export default router;
