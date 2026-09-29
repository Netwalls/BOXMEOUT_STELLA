import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Paths that should trigger audit logging
const AUDIT_PATHS = [/^\/api\/admin/, /^\/api\/wallet\/withdraw/, /^\/api\/disputes/];

// Fields that must never be persisted in audit logs
const SENSITIVE_FIELDS = [
  "password",
  "token",
  "secret",
  "authorization",
  "apiKey",
  "privateKey",
  "accessToken",
  "refreshToken",
  "signature",
  "mnemonic",
  "seed",
];

const REDACTED = "[REDACTED]";

/**
 * Check if a path should be audited
 */
function shouldAudit(path: string): boolean {
  return AUDIT_PATHS.some((pattern) => pattern.test(path));
}

/**
 * Recursively redact sensitive fields from a value before persistence.
 */
function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(obj)) {
      if (SENSITIVE_FIELDS.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
        sanitized[key] = REDACTED;
      } else {
        sanitized[key] = redactSecrets(val);
      }
    }

    return sanitized;
  }

  return value;
}

/**
 * Sanitize request body to remove sensitive fields
 */
function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  return redactSecrets(body);
}

/**
 * Extract the authenticated actor identity from the request.
 * Prefers the verified auth context over client-supplied headers.
 */
function extractActor(req: Request): string {
  const user = (req as any).user;
  const actor =
    user?.id ||
    user?.userId ||
    user?.sub ||
    (req as any).userId ||
    req.headers["x-user-id"] ||
    "unknown";

  return String(actor);
}

/**
 * Derive the audited action name from the HTTP method and path.
 */
function deriveAction(req: Request): string {
  const segments = req.path.split("/").filter(Boolean);
  const resource = segments[segments.length - 1] || "unknown";
  return `${req.method.toUpperCase()} ${resource}`;
}

/**
 * Extract the target id from route params or body.
 */
function extractTargetId(req: Request): string | null {
  const params = (req.params || {}) as Record<string, unknown>;
  const body = (req.body || {}) as Record<string, unknown>;
  const candidate =
    params.id ||
    params.disputeId ||
    params.oracleId ||
    body.id ||
    body.disputeId ||
    body.oracleId;

  return candidate !== undefined && candidate !== null ? String(candidate) : null;
}

/**
 * Build a JSON diff of before/after state for mutating admin actions.
 */
function buildDiff(req: Request): Record<string, unknown> | null {
  const body = (req.body || {}) as Record<string, unknown>;
  const before = body.before ?? body.previous ?? null;
  const after = body.after ?? body.next ?? body.updates ?? null;

  if (before === null && after === null) return null;

  return {
    before: redactSecrets(before),
    after: redactSecrets(after),
  };
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

  const actor = extractActor(req);
  const action = deriveAction(req);
  const targetId = extractTargetId(req);
  const diff = buildDiff(req);
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
          userId: actor,
          actor,
          action,
          targetId,
          diff: diff as any,
          ipAddress,
          method,
          path,
          requestBody:
            requestBody && Object.keys(requestBody as object).length > 0
              ? (requestBody as any)
              : null,
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
