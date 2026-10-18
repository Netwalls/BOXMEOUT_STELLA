import { Router } from "express";
import { getChallengeHandler } from "../controllers/auth.controller";
import {
  RATE_LIMITS,
  keyByAddressQuery,
  keyByIp,
  rateLimitMiddleware,
} from "../middleware/rateLimit.middleware";

const router = Router();

// Challenges are cheap to request but each one is a signing opportunity, so
// limit both the caller's IP and the wallet address being challenged (#1397).
const challengeIpLimiter = rateLimitMiddleware({
  windowMs: RATE_LIMITS.challengeByIp.windowMs,
  max: RATE_LIMITS.challengeByIp.max,
  keyPrefix: "auth:challenge:ip",
  keyGenerator: keyByIp,
});

const challengeAddressLimiter = rateLimitMiddleware({
  windowMs: RATE_LIMITS.challengeByAddress.windowMs,
  max: RATE_LIMITS.challengeByAddress.max,
  keyPrefix: "auth:challenge:address",
  keyGenerator: keyByAddressQuery,
});

router.get("/challenge", challengeIpLimiter, challengeAddressLimiter, getChallengeHandler);

export default router;
