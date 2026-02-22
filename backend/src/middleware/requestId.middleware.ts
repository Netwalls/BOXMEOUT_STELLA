import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { child } from '../utils/logger.js';

/**
 * Sets requestId on every request (from X-Request-Id header or new UUID)
 * and attaches a request-scoped logger to req.log with requestId.
 * Auth middleware may later enrich req.log with userId.
 */
export function requestIdMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const id = (req.headers['x-request-id'] as string) || uuidv4();
  req.requestId = id;
  req.log = child({ requestId: id }) as Request['log'];
  next();
}
