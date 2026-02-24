// backend/src/middleware/metrics.middleware.ts - Prometheus Metrics Middleware
import { Request, Response, NextFunction } from 'express';
import { trackHttpRequest, trackError } from '../config/metrics.js';

/**
 * Middleware to track HTTP request metrics
 */
export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();

  // Capture the original end function
  const originalEnd = res.end;

  // Override res.end to capture metrics when response is sent
  res.end = function (this: Response, ...args: any[]): Response {
    const duration = (Date.now() - startTime) / 1000; // Convert to seconds
    const route = req.route?.path || req.path || 'unknown';
    const method = req.method;
    const statusCode = res.statusCode;

    // Track HTTP request metrics
    trackHttpRequest(method, route, statusCode, duration);

    // Track errors (4xx and 5xx status codes)
    if (statusCode >= 400) {
      const errorType = statusCode >= 500 ? 'server_error' : 'client_error';
      trackError(errorType, route, statusCode);
    }

    // Call the original end function
    // @ts-expect-error - Express res.end has complex overloads
    return originalEnd.apply(this, args);
  };

  next();
}
