import { Request, Response } from "express";
import { generateChallenge } from "../middleware/walletAuth.middleware";

const stellarAddressRegex = /^G[A-Z0-9]{55}$/;

/**
 * GET /api/auth/challenge?address=G...
 * Issues a short-lived challenge string the caller must sign with their
 * Stellar keypair to authenticate against walletAuthMiddleware-protected routes.
 *
 * Challenges are stored in Redis (with in-memory fallback in test environments)
 * and expire after WALLET_AUTH_CHALLENGE_TTL_MS (default 5 minutes).
 */
export async function getChallengeHandler(req: Request, res: Response): Promise<void> {
  const address = String(req.query.address ?? "");

  if (!stellarAddressRegex.test(address)) {
    res.status(400).json({ error: "Invalid Stellar address", code: "INVALID_ADDRESS" });
    return;
  }

  try {
    const { challenge, expiresAt } = await generateChallenge(address);
    res.status(200).json({ challenge, expiresAt });
  } catch {
    res.status(503).json({ error: "Auth service unavailable", code: "SERVICE_UNAVAILABLE" });
  }
}
