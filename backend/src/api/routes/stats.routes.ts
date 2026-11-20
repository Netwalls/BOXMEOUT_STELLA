import { Router } from "express";
import { getPlatformStatsHandler } from "../controllers/stats.controller";

const router = Router();

// GET /api/stats — platform-wide totals, cached for 30 s (#1571 B-135)
router.get("/", getPlatformStatsHandler);

export default router;
