import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

const isProd = process.env.NODE_ENV === 'production';

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({
        message: err.message,
        statusCode: err.statusCode,
        code: err.code,
        details: err.details,
        ...(!isProd && { stack: err.stack }),
      });
    }
    res.status(err.statusCode).json({
      error: {
        statusCode: err.statusCode,
        message: err.message,
        ...(err.code && { code: err.code }),
        ...(err.details !== undefined && { details: err.details }),
      },
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  logger.error({
    message,
    ...(!isProd && { stack: err instanceof Error ? err.stack : undefined }),
  });

  res.status(500).json({
    error: {
      statusCode: 500,
      message: isProd ? 'Internal server error' : message,
    },
  });
}
