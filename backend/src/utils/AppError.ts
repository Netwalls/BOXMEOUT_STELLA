export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(message: string, code?: string, details?: unknown): AppError {
    return new AppError(400, message, code, details);
  }

  static unauthorized(message: string = 'Unauthorized', code?: string, details?: unknown): AppError {
    return new AppError(401, message, code, details);
  }

  static forbidden(message: string = 'Forbidden', code?: string, details?: unknown): AppError {
    return new AppError(403, message, code, details);
  }

  static notFound(message: string = 'Not found', code?: string, details?: unknown): AppError {
    return new AppError(404, message, code, details);
  }

  static conflict(message: string, code?: string, details?: unknown): AppError {
    return new AppError(409, message, code, details);
  }

  static internalError(message: string = 'Internal server error', code?: string, details?: unknown): AppError {
    return new AppError(500, message, code, details);
  }
}
