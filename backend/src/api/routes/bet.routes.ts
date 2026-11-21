import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import {
  getBetsByAddressHandler,
  getPortfolioHandler,
  getPayoutEstimateHandler,
  getLeaderboardHandler,
} from "../controllers/bet.controller";
import { validateAddressParam } from "../middleware/validate";
import { exportBetsCsvHandler } from "../controllers/bet-export.controller";
import { requireOwnAddress, walletAuthMiddleware } from "../middleware/walletAuth.middleware";
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

const exportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    fail(res, 429, "RATE_LIMITED", "Too many requests", { details: { retryAfter: 60 } });
  },
});

const router = Router();

// GET /api/bets/leaderboard — deprecated alias of GET /api/leaderboard (#1382)
router.get("/leaderboard", deprecatedLeaderboardAlias, validate({ query: pagedQuery }), getLeaderboardHandler);

// GET /api/bets/payout-estimate  — must come before /:address
router.get(
  "/payout-estimate",
  payoutEstimateLimiter,
  validate({ query: payoutEstimateQuery }),
  getPayoutEstimateHandler,
);

// GET /api/bets/:address/export — B-138 streaming CSV, owner-only
router.get(
  "/:address/export",
  validateAddressParam,
  walletAuthMiddleware({ whitelist: [] }),
  requireOwnAddress,
  exportLimiter,
  exportBetsCsvHandler,
);

// GET /api/bets/:address/portfolio
router.get("/:address/portfolio", validateAddressParam, privateNoStore, getPortfolioHandler);

// GET /api/bets/:address
router.get("/:address", validateAddressParam, privateNoStore, getBetsByAddressHandler);

export default router;
