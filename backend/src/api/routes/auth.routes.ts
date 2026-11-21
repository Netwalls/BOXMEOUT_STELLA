import { Router } from "express";
import {
  getChallengeHandler,
  logoutHandler,
  verifyHandler,
} from "../controllers/auth.controller";
import { rateLimitMiddleware } from "../middleware/rateLimit.middleware";

const router = Router();

router.get("/challenge", getChallengeHandler);

// B-132: exchange a signed challenge for a short-lived session token.
// Rate limited per client IP so signature guessing and token minting are bounded.
const verifyRateLimiter = rateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 10,
  keyPrefix: "auth:verify",
  keyGenerator: (req) => req.ip ?? "unknown",
});

router.post("/verify", verifyRateLimiter, verifyHandler);
router.post("/logout", logoutHandler);

export default router;
