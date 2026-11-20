import { Request, Response } from "express";
import { consumeAndVerifyChallenge, generateChallenge } from "../middleware/walletAuth.middleware";
import {
  issueSessionToken,
  revokeSession,
  verifySessionToken,
} from "../middleware/sessionToken";
import { ok, fail } from "../response";

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
    fail(res, 400, "INVALID_ADDRESS", "Invalid Stellar address");
    return;
  }

  try {
    const { challenge, expiresAt } = await generateChallenge(address);
    ok(res, { challenge, expiresAt });
  } catch {
    fail(res, 503, "SERVICE_UNAVAILABLE", "Auth service unavailable");
  }
}

/**
 * B-132: POST /api/auth/verify  { address, signature }
 * Consumes the challenge once and, on a valid signature, returns a short-lived
 * session token bound to the address. Replays fail because the challenge is gone.
 */
export async function verifyHandler(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as { address?: unknown; signature?: unknown };
  const address = typeof body.address === "string" ? body.address : "";
  const signature = typeof body.signature === "string" ? body.signature : "";

  if (!stellarAddressRegex.test(address)) {
    fail(res, 400, "INVALID_ADDRESS", "Invalid Stellar address");
    return;
  }
  if (!signature || signature.length > 256) {
    fail(res, 400, "VALIDATION_ERROR", "signature is required");
    return;
  }

  try {
    const result = await consumeAndVerifyChallenge(address, signature);
    if (!result.ok) {
      fail(
        res,
        401,
        result.code,
        result.code === "CHALLENGE_EXPIRED" ? "Challenge expired or not found" : "Invalid signature",
      );
      return;
    }
    const { token, expiresAt } = issueSessionToken(address);
    ok(res, { token, tokenType: "Bearer", expiresAt });
  } catch {
    fail(res, 503, "SERVICE_UNAVAILABLE", "Auth service unavailable");
  }
}

/**
 * B-132: POST /api/auth/logout  (Authorization: Bearer <token>)
 * Adds the token id to the denylist until the token's own expiry.
 */
export async function logoutHandler(req: Request, res: Response): Promise<void> {
  const header = req.headers.authorization;
  const token = typeof header === "string" && header.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : "";
  const claims = token ? verifySessionToken(token) : null;
  if (!claims) {
    fail(res, 401, "INVALID_TOKEN", "Session token is invalid or expired");
    return;
  }

  try {
    await revokeSession(claims);
    ok(res, { revoked: true });
  } catch {
    fail(res, 503, "SERVICE_UNAVAILABLE", "Auth service unavailable");
  }
}
