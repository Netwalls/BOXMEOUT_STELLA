/**
 * Base class for errors that carry an explicit HTTP status and machine-readable code.
 * errorHandlerMiddleware maps subclasses of this straight to that status/code;
 * anything else falls through to a generic 500.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", public readonly details?: unknown) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(message, 409, "CONFLICT");
  }
}

/** Thrown when a Soroban/Stellar contract call fails or is rejected on-chain. */
export class ContractError extends AppError {
  constructor(message: string, public readonly cause?: unknown) {
    super(message, 502, "CONTRACT_ERROR");
  }
}
