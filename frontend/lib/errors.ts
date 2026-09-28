/**
 * Typed application errors shared across the frontend.
 */

export class UserRejectedError extends Error {
  constructor(message = "User rejected the request") {
    super(message);
    this.name = "UserRejectedError";
    Object.setPrototypeOf(this, UserRejectedError.prototype);
  }
}

export function isUserRejectedError(error: unknown): error is UserRejectedError {
  return error instanceof UserRejectedError;
}
