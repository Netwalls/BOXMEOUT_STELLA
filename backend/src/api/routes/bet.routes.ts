import { Router } from "express";
import {
  getBetsByAddressHandler,
  getPortfolioHandler,
  getPayoutEstimateHandler,
  getLeaderboardHandler,
} from "../controllers/bet.controller";
import { validateAddressParam } from "../middleware/validate";
import { RATE_LIMITS, rateLimitMiddleware } from "../middleware/rateLimit.middleware";

const payoutEstimateLimiter = rateLimitMiddleware({
  windowMs: RATE_LIMITS.payoutEstimate.windowMs,
  max: RATE_LIMITS.payoutEstimate.max,
  keyPrefix: "bets:payout-estimate",
});

const router = Router();

// GET /api/bets/leaderboard  — must come before /:address
router.get("/leaderboard", getLeaderboardHandler);

// GET /api/bets/payout-estimate  — must come before /:address
router.get("/payout-estimate", payoutEstimateLimiter, getPayoutEstimateHandler);

// GET /api/bets/:address/portfolio
router.get("/:address/portfolio", validateAddressParam, getPortfolioHandler);

// GET /api/bets/:address
router.get("/:address", validateAddressParam, getBetsByAddressHandler);

export default router;
