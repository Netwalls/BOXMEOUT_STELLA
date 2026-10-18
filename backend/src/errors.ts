import { Prisma } from "@prisma/client";

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

/** Postgres SQLSTATE for a violated CHECK constraint (#1395). */
const CHECK_VIOLATION = "23514";
/** Postgres SQLSTATE for a violated unique index (#1395). */
const UNIQUE_VIOLATION = "23505";
/**
 * Prisma's ORM path reports a Postgres failure as PrismaClientUnknownRequestError,
 * with the SQLSTATE only inside the message.
 */
const POSTGRES_INTEGRITY_MESSAGE = /PostgresError \{ code: "(23505|23514)"/;

/**
 * #1395 B-97: maps a database integrity violation to a 409 ConflictError.
 *
 * Covers unique indexes (including the partial unique index on open disputes),
 * which Prisma reports as P2002, and CHECK constraints (pool and total
 * invariants), which the raw path reports as P2010 with the SQLSTATE in
 * `meta.code` and the ORM path reports in the error message.
 * Returns null for any other error.
 */
export function toConflictError(err: unknown): ConflictError | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return new ConflictError("Conflicts with existing data");
    }

    const sqlState = (err.meta as { code?: string } | undefined)?.code;
    if (err.code === "P2010" && (sqlState === CHECK_VIOLATION || sqlState === UNIQUE_VIOLATION)) {
      return new ConflictError("Request violates a data integrity rule");
    }
    return null;
  }

  if (err instanceof Prisma.PrismaClientUnknownRequestError && POSTGRES_INTEGRITY_MESSAGE.test(err.message)) {
    return new ConflictError("Request violates a data integrity rule");
  }

  return null;
}
