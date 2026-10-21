import { Router } from "express";
import { healthCheckHandler } from "../controllers/market.controller";
import { readinessHandler } from "../controllers/readiness.controller";

const router = Router();

/** GET /health — liveness probe (DB ping only) */
router.get("/health", healthCheckHandler);

/**
 * GET /ready — readiness probe (B-60)
 * Returns 200 when DB, Redis, and Soroban RPC are all reachable.
 * Returns 503 with per-dependency status when any check fails.
 */
router.get("/ready", readinessHandler);

export default router;
