import { Router } from "express";
import { getLeaderboardHandler } from "../controllers/bet.controller";

const router = Router();

// GET /api/leaderboard?period=7d|30d|all — ranked bettors by realised profit (#1249, #1382)
router.get("/", getLeaderboardHandler);

export default router;
