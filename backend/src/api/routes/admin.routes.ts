import { Router } from "express";
import {
  getPendingResolutionsHandler,
  resolveDisputeHandler,
} from "../controllers/market.controller";
import {
  getAllOraclesHandler,
  createOracleHandler,
  updateOracleHandler,
  deleteOracleHandler,
} from "../controllers/oracle.controller";
import { getAuditLogsHandler } from "../controllers/audit.controller";
import { getMaintenanceHandler, setMaintenanceHandler } from "../controllers/maintenance.controller";
import { reconcileMarketHandler } from "../controllers/market-reconciliation.controller";
import * as oracleService from "../../services/oracle.service";
import { logger } from "../../logger";
import { ok, fail } from "../response";
import {
  getFailedSubmissionsHandler,
  retryFailedSubmissionHandler,
} from "../controllers/oracleSubmission.controller";
import {
  createWebhookHandler,
  deleteWebhookHandler,
  listWebhookDeliveriesHandler,
  listWebhooksHandler,
  updateWebhookHandler,
} from "../controllers/webhook.controller";
import { rateLimitMiddleware } from "../middleware/rateLimit.middleware";
import { adminAuth } from "../middleware/adminAuth";
import { auditLogMiddleware } from "../middleware/audit-log.middleware";
import { validate } from "../middleware/validate";
import {
  auditLogsQuery,
  createOracleBody,
  idParams,
  pagedQuery,
  updateOracleBody,
} from "../schemas/routes.schema";

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
  // #1583: admin writes must not lose their limit during a Redis outage.
  failMode: "closed",
});

// Oracle CRUD is lower-stakes admin bookkeeping — looser limit.
const oracleWriteLimiter = rateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 30,
  keyPrefix: "admin:oracles:write",
  // #1583: admin writes must not lose their limit during a Redis outage.
  failMode: "closed",
});

// #1257: Oracle result submission retry/idempotency admin surface.
const oracleSubmissionLimiter = rateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 30,
  keyPrefix: "admin:oracle-submissions:write",
  // #1583: admin writes must not lose their limit during a Redis outage.
  failMode: "closed",
});

// Market management
router.get("/markets/pending", getPendingResolutionsHandler);
// Registered before "/markets/:marketId/resolve" so "dispute" is not captured as a market id.
// B-137: cancel an Open or Locked market (on-chain cancel_market, audited).
router.post("/markets/cancel", marketResolutionLimiter, cancelMarketHandler);
router.post("/markets/dispute/resolve", marketResolutionLimiter, resolveDisputeHandler);
// #1412: reconcile one market against on-chain state (report-only unless autoRepair).
router.post("/markets/:id/reconcile", validate({ params: idParams }), reconcileMarketHandler);

// B-143 (#1579): all oracle reports for a market, so an admin can see agreement or conflict.
router.get("/markets/:id/oracle-reports", async (req, res) => {
  try {
    ok(res, await oracleService.listMarketOracleReports(req.params.id));
  } catch (err) {
    logger.error({ err }, "listMarketOracleReports failed");
    fail(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

// Oracle address management (Issue #455)
router.get("/oracles", getAllOraclesHandler);
router.post("/oracles", oracleWriteLimiter, validate({ body: createOracleBody }), createOracleHandler);
router.patch(
  "/oracles/:id",
  oracleWriteLimiter,
  validate({ params: idParams, body: updateOracleBody }),
  updateOracleHandler,
);
router.delete("/oracles/:id", oracleWriteLimiter, validate({ params: idParams }), deleteOracleHandler);

// Oracle result submission jobs (Issue #1257)
router.get("/oracle-submissions/failed", validate({ query: pagedQuery }), getFailedSubmissionsHandler);
router.post(
  "/oracle-submissions/:id/retry",
  oracleSubmissionLimiter,
  validate({ params: idParams }),
  retryFailedSubmissionHandler,
);

// Outbound webhook endpoints (#1581). Secrets are shown once, on create.
router.get("/webhooks", listWebhooksHandler);
router.post("/webhooks", oracleWriteLimiter, createWebhookHandler);
router.patch("/webhooks/:id", oracleWriteLimiter, updateWebhookHandler);
router.delete("/webhooks/:id", oracleWriteLimiter, deleteWebhookHandler);
router.get("/webhooks/:id/deliveries", listWebhookDeliveriesHandler);

// Audit logging (Issue #456, #1258)
// Supports ?actor=<id>&action=<action> filtering.
router.get("/audit-logs", validate({ query: auditLogsQuery }), getAuditLogsHandler);

// B-160: maintenance (read-only) mode. POST is exempt from the write block so
// an admin can always turn it off. Every change is written to the audit log.
const maintenanceWriteLimiter = rateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 10,
  keyPrefix: "admin:maintenance:write",
});
router.get("/maintenance", getMaintenanceHandler);
router.post("/maintenance", maintenanceWriteLimiter, setMaintenanceHandler);

export default router;
