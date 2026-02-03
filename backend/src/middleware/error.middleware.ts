import { Request, Response, NextFunction } from 'express';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });

  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details: any = undefined;

  // Handle known error types
  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err.name === 'ZodError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
  } else if (
    err.name === 'UnauthorizedError' ||
    err.message.includes('Unauthorized')
  ) {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    message = 'Authentication required';
  } else if (
    err.message.includes('Forbidden') ||
    err.message.includes('permission')
  ) {
    statusCode = 403;
    code = 'FORBIDDEN';
    message = 'Insufficient permissions';
  } else if (
    err.message.includes('not found') ||
    err.message.includes('Not found')
  ) {
    statusCode = 404;
    code = 'NOT_FOUND';
    message = 'Resource not found';
  }

  const isDevelopment = process.env.NODE_ENV === 'development';
  const response: any = {
    success: false,
    error: {
      code,
      message: err.message || message,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  if (details) {
    response.error.details = details;
  }

  if (isDevelopment && err.stack) {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

export const notFoundHandler = (req: Request, res: Response) => {
  throw new ApiError(404, 'NOT_FOUND', `Cannot ${req.method} ${req.path}`);
};
