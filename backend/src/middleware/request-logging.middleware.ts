import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

const SENSITIVE_PATHS = ['/api/oracle/submit', '/api/admin'];

/**
 * Request logging middleware with structured format.
 * Development: human-readable format
 * Production: JSON format for log aggregation
 * Masks request body for sensitive paths
 */
export function requestLogging(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const method = req.method;
  const path = req.path;

  // Capture response end to log status and response time
  const originalSend = res.send;
  res.send = function (data: unknown) {
    const responseTime = Date.now() - startTime;
    const statusCode = res.statusCode;

    const isSensitive = SENSITIVE_PATHS.some((p) => path.startsWith(p));
    const body = isSensitive ? '[REDACTED]' : JSON.stringify(req.body);

    const logData = {
      method,
      path,
      statusCode,
      responseTime: `${responseTime}ms`,
      ip,
      ...(isSensitive && { body }),
    };

    if (process.env.NODE_ENV === 'production') {
      logger.info(logData, `${method} ${path} ${statusCode}`);
    } else {
      logger.info(logData, `${method} ${path} ${statusCode} (${responseTime}ms)`);
    }

    return originalSend.call(this, data);
  };

  next();
}
