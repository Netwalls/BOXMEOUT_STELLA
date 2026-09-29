import { randomBytes } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { Keypair } from "@stellar/stellar-sdk";
import Redis from "ioredis";

const CHALLENGE_TTL_MS = Number(process.env.WALLET_AUTH_CHALLENGE_TTL_MS ?? 5 * 60 * 1000);
const CHALLENGE_PREFIX = "BOXMEOUT-AUTH";
const REDIS_KEY_PREFIX = "wallet-challenge:";

// ---------------------------------------------------------------------------
// Challenge store — Redis in production/development, in-memory in tests.
// The in-memory fallback keeps the test suite fast and dependency-free while
// the production path is horizontally scalable.
// ---------------------------------------------------------------------------

interface StoredChallenge {
  nonce: string;
  expiresAt: number;
}

// In-memory store used only when NODE_ENV === "test".
const memStore = new Map<string, StoredChallenge>();

function pruneMemStore(): void {
  const now = Date.now();
  for (const [key, entry] of memStore) {
    if (entry.expiresAt <= now) memStore.delete(key);
  }
}

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      lazyConnect: true,
    });
  }
  return _redis;
}

const useMemStore = process.env.NODE_ENV === "test";

/**
 * Persist a challenge entry. Returns true on success, false if a challenge
 * already exists and NX semantics rejected the write (should not happen in
 * practice because we always call generateChallenge fresh, but guards against
 * concurrent races).
 */
async function setChallenge(address: string, nonce: string, ttlMs: number): Promise<void> {
  const expiresAt = Date.now() + ttlMs;

  if (useMemStore) {
    pruneMemStore();
    memStore.set(address, { nonce, expiresAt });
    return;
  }

  const key = `${REDIS_KEY_PREFIX}${address}`;
  // SET key value PX ttl NX — atomic, one-entry-per-address
  await getRedis().set(key, JSON.stringify({ nonce, expiresAt }), "PX", ttlMs, "NX");
  // If NX rejected (key existed), overwrite — a fresh challenge always supersedes.
  // We use a second unconditional SET so callers always get a fresh challenge.
  await getRedis().set(key, JSON.stringify({ nonce, expiresAt }), "PX", ttlMs);
}

/**
 * Atomically consume (read + delete) a challenge. Returns the entry if it
 * exists and is not expired, null otherwise. One-time use is enforced by the
 * delete — even if verification fails the challenge cannot be replayed.
 */
async function consumeChallenge(address: string): Promise<StoredChallenge | null> {
  if (useMemStore) {
    const entry = memStore.get(address);
    memStore.delete(address);
    if (!entry || entry.expiresAt <= Date.now()) return null;
    return entry;
  }

  const key = `${REDIS_KEY_PREFIX}${address}`;
  // GETDEL atomically reads and removes the key — one-time use guarantee.
  const raw = await getRedis().getdel(key);
  if (!raw) return null;

  let entry: StoredChallenge;
  try {
    entry = JSON.parse(raw) as StoredChallenge;
  } catch {
    return null;
  }

  if (entry.expiresAt <= Date.now()) return null;
  return entry;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Issues a fresh challenge string for `address`, replacing any prior one.
 * The client must sign this exact string with their Stellar keypair and
 * present it back via the `x-wallet-signature` header within the TTL.
 */
export async function generateChallenge(
  address: string
): Promise<{ challenge: string; expiresAt: number }> {
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;

  await setChallenge(address, nonce, CHALLENGE_TTL_MS);

  return { challenge: `${CHALLENGE_PREFIX}:${address}:${nonce}`, expiresAt };
}

function isWhitelisted(address: string, whitelist: string[]): boolean {
  return whitelist.includes(address);
}

function parseWhitelist(envVar: string | undefined): string[] {
  if (!envVar) return [];
  return envVar
    .split(",")
    .map((addr) => addr.trim())
    .filter(Boolean);
}

export interface WalletAuthOptions {
  /** Whitelisted Stellar addresses. Defaults to ADMIN_WALLET_ADDRESSES env var. */
  whitelist?: string[];
}

/**
 * Challenge/response auth middleware for admin/oracle routes.
 *
 * Flow:
 *   1. Client calls GET /api/auth/challenge?address=G... to obtain a nonce.
 *   2. Client signs the returned challenge string with its Stellar secret key.
 *   3. Client calls the protected route with headers:
 *        x-wallet-address:   G...
 *        x-wallet-signature: <base64 signature>
 *
 * Rejects with 401 if the challenge is missing/expired/already used, and with
 * 403 if the address is not on the whitelist.
 *
 * When no whitelist is configured (ADMIN_WALLET_ADDRESSES is unset), any valid
 * signature over a known challenge is accepted — suitable for end-user routes
 * like POST /api/markets where any wallet owner may create a market.
 */
export function walletAuthMiddleware(options: WalletAuthOptions = {}) {
  const whitelist = options.whitelist ?? parseWhitelist(process.env.ADMIN_WALLET_ADDRESSES);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const address = req.headers["x-wallet-address"];
    const signature = req.headers["x-wallet-signature"];

    if (typeof address !== "string" || typeof signature !== "string" || !address || !signature) {
      res.status(401).json({ error: "Wallet signature required", code: "WALLET_AUTH_REQUIRED" });
      return;
    }

    // Only enforce whitelist when one is configured.
    if (whitelist.length > 0 && !isWhitelisted(address, whitelist)) {
      res.status(403).json({ error: "Address is not whitelisted", code: "WALLET_NOT_WHITELISTED" });
      return;
    }

    let entry: StoredChallenge | null;
    try {
      entry = await consumeChallenge(address);
    } catch {
      // Redis unavailable — fail closed to protect the route.
      res.status(503).json({ error: "Auth service unavailable", code: "SERVICE_UNAVAILABLE" });
      return;
    }

    if (!entry) {
      res.status(401).json({ error: "Challenge expired or not found", code: "CHALLENGE_EXPIRED" });
      return;
    }

    const challengeString = `${CHALLENGE_PREFIX}:${address}:${entry.nonce}`;

    let verified: boolean;
    try {
      const keypair = Keypair.fromPublicKey(address);
      verified = keypair.verify(Buffer.from(challengeString), Buffer.from(signature, "base64"));
    } catch {
      verified = false;
    }

    if (!verified) {
      res.status(401).json({ error: "Invalid signature", code: "INVALID_SIGNATURE" });
      return;
    }

    (req as Request & { walletAddress?: string }).walletAddress = address;
    next();
  };
}
