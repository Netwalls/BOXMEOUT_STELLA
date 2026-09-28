import { timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * Oracle authentication middleware.
 *
 * Scheme: static API key in the `X-Oracle-Key` request header.
 *
 * Set ORACLE_API_KEY in your environment (see .env.example).
 * The same key name is used in .env.example and docs/api.md.
 *
 * Uses crypto.timingSafeEqual to prevent timing attacks.
 * Returns 401 { error, code } on any failure.
 */
export function oracleAuth(req: Request, res: Response, next: NextFunction): void {
  const provided = req.headers["x-oracle-key"];

  if (typeof provided !== "string" || !provided) {
    res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
    return;
  }

  const expected = process.env.ORACLE_API_KEY ?? "";

  if (!expected) {
    res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
    return;
  }

  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    const len = Math.max(a.length, b.length);
    const bufA = Buffer.alloc(len);
    const bufB = Buffer.alloc(len);
    a.copy(bufA);
    b.copy(bufB);

    if (!timingSafeEqual(bufA, bufB) || a.length !== b.length) {
      res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
      return;
    }
  } catch {
    res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
    return;
  }

  next();
}
