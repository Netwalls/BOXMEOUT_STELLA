import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  getBetsByAddressHandler,
  getPortfolioHandler,
  getPayoutEstimateHandler,
  getLeaderboardHandler,
} from "../controllers/bet.controller";

const payoutEstimateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: "Too many requests",
      code: "RATE_LIMITED",
      retryAfter: 60,
    });
  },
});

const router = Router();

// GET /api/bets/leaderboard  — must come before /:address
router.get("/leaderboard", getLeaderboardHandler);

// GET /api/bets/payout-estimate  — must come before /:address
router.get("/payout-estimate", payoutEstimateLimiter, getPayoutEstimateHandler);

// GET /api/bets/:address/portfolio
router.get("/:address/portfolio", getPortfolioHandler);

// GET /api/bets/:address
router.get("/:address", getBetsByAddressHandler);

export default router;
