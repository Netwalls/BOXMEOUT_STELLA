import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import {
  getBetsByAddressHandler,
  getPortfolioHandler,
  getPayoutEstimateHandler,
  getLeaderboardHandler,
} from "../controllers/bet.controller";
import { validateAddressParam } from "../middleware/validate";
import { cacheControl, privateNoStore } from "../middleware/cacheControl.middleware";
import { fail } from "../response";

const payoutEstimateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    fail(res, 429, "RATE_LIMITED", "Too many requests", { details: { retryAfter: 60 } });
  },
});

const deprecatedLeaderboardAlias = (_req: Request, res: Response, next: NextFunction): void => {
  res.setHeader("Deprecation", "true");
  res.setHeader("Link", '</api/leaderboard>; rel="successor-version"');
  next();
};

const router = Router();

// GET /api/bets/leaderboard — deprecated alias of GET /api/leaderboard (#1382)
router.get("/leaderboard", deprecatedLeaderboardAlias, cacheControl({ maxAge: 30, staleWhileRevalidate: 60 }), getLeaderboardHandler);

// GET /api/bets/payout-estimate  — must come before /:address
router.get("/payout-estimate", payoutEstimateLimiter, cacheControl({ maxAge: 5, staleWhileRevalidate: 30 }), getPayoutEstimateHandler);

// GET /api/bets/:address/portfolio
router.get("/:address/portfolio", validateAddressParam, privateNoStore, getPortfolioHandler);

// GET /api/bets/:address
router.get("/:address", validateAddressParam, privateNoStore, getBetsByAddressHandler);

export default router;
