import { Router } from "express";
import { getLeaderboardHandler } from "../controllers/bet.controller";
import { cacheControl } from "../middleware/cacheControl.middleware";

const router = Router();

// GET /api/leaderboard?period=7d|30d|all — ranked bettors by realised profit (#1249, #1382)
router.get("/", cacheControl({ maxAge: 30, staleWhileRevalidate: 60 }), getLeaderboardHandler);

export default router;
