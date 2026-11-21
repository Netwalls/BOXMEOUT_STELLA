/**
 * B-132: short-lived session tokens issued after a wallet challenge is verified.
 *
 * Token format: base64url(payload) "." base64url(HMAC-SHA256(payload, JWT_SECRET))
 * Payload: { sub: <G... address>, jti: <random id>, iat, exp (unix seconds), typ: "session" }
 *
 * Logout adds the jti to a denylist (Redis, or in-memory under NODE_ENV=test)
 * that is kept until the token's own expiry, so revoked tokens stop working
 * even though they are otherwise still valid.
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import Redis from "ioredis";

export const SESSION_TTL_SECONDS = 15 * 60;
const DENYLIST_PREFIX = "session-denylist:";
const TOKEN_TYPE = "session";

export interface SessionClaims {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  typ: string;
}

const b64url = (input: Buffer | string): string =>
  Buffer.from(input).toString("base64url");

/**
 * JWT_SECRET is validated at startup by config.ts (required, >= 32 chars). This
 * re-checks at use so the module stays safe when imported without the full config.
 */
function signingKey(): string {
  const secret = process.env.JWT_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters");
  }
  return secret;
}

function sign(encodedPayload: string): Buffer {
  return createHmac("sha256", signingKey()).update(encodedPayload).digest();
}

/** Issues a session token bound to `address`, valid for SESSION_TTL_SECONDS. */
export function issueSessionToken(
  address: string,
  nowMs: number = Date.now(),
): { token: string; expiresAt: number; jti: string } {
  const iat = Math.floor(nowMs / 1000);
  const exp = iat + SESSION_TTL_SECONDS;
  const jti = randomBytes(16).toString("hex");
  const claims: SessionClaims = { sub: address, jti, iat, exp, typ: TOKEN_TYPE };
  const encoded = b64url(JSON.stringify(claims));
  const token = `${encoded}.${b64url(sign(encoded))}`;
  return { token, expiresAt: exp * 1000, jti };
}

/**
 * Verifies signature, type and expiry. Returns the claims, or null when the
 * token is malformed, tampered with, of another type, or expired. Does NOT check
 * the denylist; use isSessionRevoked for that.
 */
export function verifySessionToken(
  token: string,
  nowMs: number = Date.now(),
): SessionClaims | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [encoded, sigPart] = parts;

  const expected = sign(encoded);
  const given = Buffer.from(sigPart, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let claims: SessionClaims;
  try {
    claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionClaims;
  } catch {
    return null;
  }

  if (claims.typ !== TOKEN_TYPE || typeof claims.sub !== "string" || typeof claims.jti !== "string") {
    return null;
  }
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= nowMs) return null;
  return claims;
}

// ---------------------------------------------------------------------------
// Denylist. Redis in production/development, in-memory under NODE_ENV=test.
// ---------------------------------------------------------------------------

const useMemStore = process.env.NODE_ENV === "test";
const memDenylist = new Map<string, number>(); // jti -> expiresAt (ms)

let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { lazyConnect: true });
  }
  return _redis;
}

/** Adds the token id to the denylist until the token would have expired anyway. */
export async function revokeSession(claims: SessionClaims, nowMs: number = Date.now()): Promise<void> {
  const ttlMs = claims.exp * 1000 - nowMs;
  if (ttlMs <= 0) return;

  if (useMemStore) {
    memDenylist.set(claims.jti, nowMs + ttlMs);
    return;
  }
  await getRedis().set(`${DENYLIST_PREFIX}${claims.jti}`, "1", "PX", ttlMs);
}

/** True when the token id has been revoked. Throws if the store is unreachable. */
export async function isSessionRevoked(jti: string, nowMs: number = Date.now()): Promise<boolean> {
  if (useMemStore) {
    const until = memDenylist.get(jti);
    if (until === undefined) return false;
    if (until <= nowMs) {
      memDenylist.delete(jti);
      return false;
    }
    return true;
  }
  return (await getRedis().exists(`${DENYLIST_PREFIX}${jti}`)) === 1;
}

/** Test helper: clears the in-memory denylist. */
export function resetSessionDenylistForTests(): void {
  memDenylist.clear();
}
