import { createHash, timingSafeEqual } from "crypto";
import type { RequestHandler } from "express";

export interface ApiKeyAuthOptions {
  /** Request header carrying the key, e.g. `x-admin-key`. */
  header: string;
  /**
   * Returns the expected key. Called on every request so the value always
   * comes from the validated config rather than a copy taken at load time.
   */
  getKey: () => string;
}

/** Hashing both sides gives equal-length buffers, so the compare leaks no length information. */
function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * Static API key authentication. Rejects with 401 `{ error, code }` when the
 * header is missing, the expected key is empty, or the keys differ.
 *
 * Uses crypto.timingSafeEqual to prevent timing attacks.
 */
export function apiKeyAuth({ header, getKey }: ApiKeyAuthOptions): RequestHandler {
  return (req, res, next) => {
    const provided = req.headers[header];
    const expected = getKey();

    if (
      typeof provided !== "string" ||
      !provided ||
      !expected ||
      !timingSafeEqual(digest(provided), digest(expected))
    ) {
      res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
      return;
    }

    next();
  };
}
