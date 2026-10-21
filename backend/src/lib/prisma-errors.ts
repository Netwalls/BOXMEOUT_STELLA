import { Prisma } from "@prisma/client";

/** Prisma error code raised when a unique constraint is violated. */
const UNIQUE_CONSTRAINT_CODE = "P2002";

/**
 * B-103: True when a write failed because a unique constraint already holds the
 * value, for example a market id that was created by an earlier request. Callers
 * map this to 409 Conflict rather than 500.
 */
export function isUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === UNIQUE_CONSTRAINT_CODE
  );
}
