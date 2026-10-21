/**
 * B-102: Timeouts for HTTP requests, the Node server, and outbound calls.
 *
 * A stuck RPC or database call used to hold a connection open indefinitely.
 * These helpers give every layer an explicit upper bound:
 *   - applyServerTimeouts: Node-level header, request and keep-alive limits
 *   - requestTimeoutMiddleware: answers 503 when a route takes too long
 *   - withTimeout: rejects a promise that has not settled in time (Prisma, RPC)
 */
import type { NextFunction, Request, Response } from "express";
import type { Server } from "http";
import { logger } from "../logger";

export class TimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs} ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Rejects with a TimeoutError if `promise` does not settle within `timeoutMs`.
 * The underlying work is not cancelled; only the caller stops waiting for it.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, timeoutMs)), timeoutMs);
  });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

/**
 * SSE streams (`/stream` routes) are long-lived by design, so the per-request
 * timeout must not apply to them.
 */
export function isLongLivedRoute(path: string): boolean {
  return path.endsWith("/stream");
}

export interface ServerTimeouts {
  keepAliveTimeoutMs: number;
  headersTimeoutMs: number;
  requestTimeoutMs: number;
}

/**
 * Applies Node's HTTP server timeouts. `headersTimeout` must exceed
 * `keepAliveTimeout`, otherwise the server can close idle keep-alive sockets
 * while a client still believes they are reusable.
 */
export function applyServerTimeouts(server: Server, timeouts: ServerTimeouts): void {
  server.keepAliveTimeout = timeouts.keepAliveTimeoutMs;
  server.headersTimeout = timeouts.headersTimeoutMs;
  server.requestTimeout = timeouts.requestTimeoutMs;
}

/**
 * Responds 503 if a non-SSE request has not finished within `timeoutMs`.
 *
 * The handler may still resolve later. Once the 503 is sent, the response
 * methods become no-ops so a late `res.json()` cannot throw
 * ERR_HTTP_HEADERS_SENT inside an async handler.
 */
export function requestTimeoutMiddleware(timeoutMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (isLongLivedRoute(req.path)) {
      next();
      return;
    }

    const requestId = (req as Request & { id?: string }).id;
    const timer = setTimeout(() => {
      if (res.headersSent) return;

      logger.warn(
        { method: req.method, path: req.path, timeoutMs, requestId },
        "request timed out",
      );

      res.status(503).json({ error: "Request timed out", code: "REQUEST_TIMEOUT", requestId });

      // Sent first: res.json() calls res.send(), so silencing must come after.
      const silenced = (): Response => res;
      res.json = silenced as Response["json"];
      res.send = silenced as Response["send"];
      res.end = silenced as Response["end"];
      res.status = silenced as Response["status"];
    }, timeoutMs);

    const clear = () => clearTimeout(timer);
    res.on("finish", clear);
    res.on("close", clear);

    next();
  };
}
