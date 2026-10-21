import type { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

export const REQUEST_ID_HEADER = "x-request-id";

/**
 * B-59: Request ID middleware
 *
 * Accepts an incoming X-Request-Id header or generates a new UUID v4.
 * Attaches the ID to:
 *   - req.id (for downstream use in logs and handlers)
 *   - res header X-Request-Id (echoed back to callers)
 *
 * Must be registered before pinoHttp so that pinoHttp picks up req.id.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  // Accept a single string value; if the header was sent multiple times
  // (array), use the first value.
  const id: string =
    typeof incoming === "string" && incoming.trim().length > 0
      ? incoming.trim()
      : uuidv4();

  // Attach to request so pinoHttp and other middleware can read it
  (req as Request & { id: string }).id = id;

  // Echo in the response so clients can correlate logs
  res.setHeader(REQUEST_ID_HEADER, id);

  next();
}
