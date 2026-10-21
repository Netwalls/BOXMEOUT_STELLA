import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger, sanitizeErrorForLog } from "../../logger";
import { AppError } from "../../errors";
import { fail } from "../response";

/**
 * Centralized error-to-HTTP mapping. Must be registered last, after all routes.
 *
 * - ZodError                -> 400 VALIDATION_ERROR (with field-level details)
 * - AppError (and subclasses, e.g. ContractError, NotFoundError) -> its own statusCode/code
 * - OracleAuthorizationError -> 403 FORBIDDEN
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
    { err: sanitizeErrorForLog(err), path: req.path, method: req.method, requestId },
    "unhandled request error",
  );

  if (err instanceof ZodError) {
    fail(res, 400, "VALIDATION_ERROR", "Validation failed", {
      details: err.flatten(),
      requestId,
    });
    return;
  }

  if (err instanceof AppError) {
    fail(res, err.statusCode, err.code, err.message, { requestId });
    return;
  }

  // B-103: a unique-constraint violation means the resource already exists
  if (isUniqueConstraintError(err)) {
    res.status(409).json({ error: "Resource already exists", code: "CONFLICT", requestId });
    return;
  }

  if (err instanceof Error && err.name === "OracleAuthorizationError") {
    fail(res, 403, "FORBIDDEN", err.message, { requestId });
    return;
  }

  fail(res, 500, "INTERNAL_ERROR", "Internal server error", { requestId });
}
