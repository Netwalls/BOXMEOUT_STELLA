import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Paths that should trigger audit logging
const AUDIT_PATHS = [/^\/api\/admin/, /^\/api\/wallet\/withdraw/, /^\/api\/disputes/];

/**
 * Check if a path should be audited
 */
function shouldAudit(path: string): boolean {
  return AUDIT_PATHS.some((pattern) => pattern.test(path));
}

/**
 * Sanitize request body to remove sensitive fields
 */
function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;

  const obj = body as Record<string, unknown>;
  const sanitized = { ...obj };

  // Remove sensitive fields
  const sensitiveFields = [
    "password",
    "token",
    "secret",
    "authorization",
    "apiKey",
    "privateKey",
  ];

  sensitiveFields.forEach((field) => {
    if (field in sanitized) {
      delete sanitized[field];
    }
  });

  return sanitized;
}

/**
 * Extract user ID from request (from auth context, headers, or session)
 */
function extractUserId(req: Request): string {
  // Try various ways to get user ID
  const userId =
    (req as any).user?.id ||
    (req as any).userId ||
    req.headers["x-user-id"] ||
    req.headers.authorization ||
    "unknown";

  return String(userId);
}

/**
 * Extract client IP address
 */
function getClientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

/**
 * Audit logging middleware
 * Records sensitive actions for compliance and incident response
 */
export function auditLogMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!shouldAudit(req.path)) {
    next();
    return;
  }

  const userId = extractUserId(req);
  const ipAddress = getClientIp(req);
  const method = req.method;
  const path = req.path;
  const requestBody = sanitizeBody(req.body);

  // Wrap the response to capture status code
  const originalSend = res.send;
  let statusCode = res.statusCode;

  res.send = function (data) {
    statusCode = res.statusCode;

    // Log to database asynchronously (non-blocking)
    prisma.auditLog
      .create({
        data: {
          userId,
          ipAddress,
          method,
          path,
          requestBody: Object.keys(requestBody as object).length > 0 ? requestBody : null,
          statusCode,
          timestamp: new Date(),
        },
      })
      .catch((err) => {
        console.error("Failed to write audit log:", err);
      });

    return originalSend.call(this, data);
  };

  next();
}
