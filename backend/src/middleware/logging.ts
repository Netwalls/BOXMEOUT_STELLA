import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

/**
 * Middleware to add a unique request ID to each request and log the request/response.
 */
export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Get request ID from header or generate a new one
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();

  // Set the request ID in the response header
  res.setHeader('x-request-id', requestId);

  // Attach requestId to req for use in other parts of the application
  (req as any).requestId = requestId;

  // Record start time
  const start = Date.now();

  // Log request
  logger.info(`${req.method} ${req.originalUrl}`, {
    requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Log response when it finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;

    // Determine log level based on status code
    let level = 'info';
    if (statusCode >= 500) {
      level = 'error';
    } else if (statusCode >= 400) {
      level = 'warn';
    }

    (logger as any)[level](
      `${req.method} ${req.originalUrl} ${statusCode} - ${duration}ms`,
      {
        requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode,
        duration,
      }
    );
  });

  next();
};

export default requestLogger;
