// backend/src/middleware/metrics.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { trackHttpRequest, trackError } from '../config/metrics.js';

/**
 * Normalise a raw URL path into a low-cardinality route label.
 *
 * Express populates req.route.path only after the route handler is matched,
 * which happens before res.end() is called, so we can safely read it there.
 * As a fallback we strip UUIDs, numeric IDs, and Stellar public-key segments
 * from the raw path so Prometheus doesn't explode with per-resource series.
 */
function resolveRouteLabel(req: Request): string {
  // Best case: Express matched a route and we have the pattern (e.g. /api/markets/:id)
  if (req.route?.path) {
    const base = req.baseUrl ?? '';
    return `${base}${req.route.path}`;
  }

  // Fallback: sanitise the raw path
  return (
    req.path
      // UUIDs
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        ':id'
      )
      // Stellar public keys (G…, 56 chars)
      .replace(/G[A-Z2-7]{55}/g, ':publicKey')
      // Pure numeric segments
      .replace(/\/\d+/g, '/:id')
      // Hex strings ≥ 16 chars (tx hashes, contract IDs, etc.)
      .replace(/[0-9a-f]{16,}/gi, ':hash') || '/'
  );
}

/**
 * Instruments every HTTP request with:
 *  - http_requests_total          (counter, labels: method, route, status_code)
 *  - http_request_duration_seconds (histogram, same labels)
 *  - errors_total                 (counter, labels: error_type, route, status_code)
 *
 * Uses process.hrtime.bigint() for sub-millisecond precision.
 */
export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startNs = process.hrtime.bigint();

  // Hook into res.end — the single exit point for all Express responses
  const originalEnd = res.end.bind(res);

  // @ts-expect-error — res.end has multiple overloads; we wrap them all
  res.end = function (
    ...args: Parameters<typeof res.end>
  ): ReturnType<typeof res.end> {
    const durationSeconds = Number(process.hrtime.bigint() - startNs) / 1e9;
    const route = resolveRouteLabel(req);
    const method = req.method;
    const statusCode = res.statusCode;

    trackHttpRequest(method, route, statusCode, durationSeconds);

    if (statusCode >= 400) {
      const errorType = statusCode >= 500 ? 'server_error' : 'client_error';
      trackError(errorType, route, statusCode);
    }

    return originalEnd(...args);
  };

  next();
}
