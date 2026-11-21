import type { NextFunction, Request, Response, RequestHandler } from "express";

/**
 * B-123 (#1559): HTTP caching headers for read endpoints.
 *
 * Public reads use a short max-age so browsers and CDNs can absorb poll
 * traffic without serving stale market state for long. Express already emits a
 * weak ETag for these responses, so a conditional request with If-None-Match
 * is answered with 304.
 */

export interface CacheControlOptions {
  /** Seconds a shared or private cache may serve the response without revalidating. */
  maxAge: number;
  /** Seconds a stale response may be served while it is revalidated in the background. */
  staleWhileRevalidate?: number;
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
  }
}

/**
 * Sets `Cache-Control: public, max-age=…, stale-while-revalidate=…` on a route.
 * Validates its options when the route is built, so a bad value fails at startup.
 */
export function cacheControl({
  maxAge,
  staleWhileRevalidate = 0,
}: CacheControlOptions): RequestHandler {
  assertNonNegativeInteger("maxAge", maxAge);
  assertNonNegativeInteger("staleWhileRevalidate", staleWhileRevalidate);

  const value = `public, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`;

  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader("Cache-Control", value);
    next();
  };
}

/** For user-specific or authenticated responses: never store them in a shared cache. */
export const privateNoStore: RequestHandler = (
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
};
