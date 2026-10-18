import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "../../logger";
import { AppError, toConflictError } from "../../errors";

/**
 * Centralized error-to-HTTP mapping. Must be registered last, after all routes.
 *
 * - ZodError                -> 400 VALIDATION_ERROR (with field-level details)
 * - AppError (and subclasses, e.g. ContractError, NotFoundError) -> its own statusCode/code
 * - OracleAuthorizationError -> 403 FORBIDDEN
 * - database integrity violations (unique / CHECK, #1395) -> 409 CONFLICT
 * - anything else            -> 500 INTERNAL_ERROR, generic message only — never the stack
 *   or the raw error message, so internals can't leak into a client response.
 *
 * B-59: The X-Request-Id is echoed in every error response body as `requestId`
 *       so clients can correlate error reports with server logs.
 */
export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  // B-59: read the request ID attached by requestIdMiddleware
  const requestId = (req as Request & { id?: string }).id;

  logger.error(
    { err, path: req.path, method: req.method, requestId },
    "unhandled request error",
  );

  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: err.flatten(),
      requestId,
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code, requestId });
    return;
  }

  const conflict = toConflictError(err);
  if (conflict) {
    res.status(409).json({ error: conflict.message, code: conflict.code, requestId });
    return;
  }

  if (err instanceof Error && err.name === "OracleAuthorizationError") {
    res.status(403).json({ error: err.message, code: "FORBIDDEN", requestId });
    return;
  }

  res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR", requestId });
}
