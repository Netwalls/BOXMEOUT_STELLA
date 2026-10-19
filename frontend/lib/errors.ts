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

/**
 * Error raised when a Soroban contract call fails with a known contract error
 * code (e.g. `Error(Contract, #3)`). `code` is the numeric contract error.
 */
export class ContractErrorException extends Error {
  readonly code: number;

  constructor(code: number, message = `Contract error #${code}`) {
    super(message);
    this.name = "ContractErrorException";
    this.code = code;
    Object.setPrototypeOf(this, ContractErrorException.prototype);
  }
}

const CONTRACT_ERROR_PATTERN = /Error\(Contract,\s*#(\d+)\)/;

/**
 * Pulls the numeric contract error code out of a raw Soroban host error string.
 * Returns null when the text does not describe a contract error.
 */
export function parseContractErrorCode(raw: string): number | null {
  const match = CONTRACT_ERROR_PATTERN.exec(raw);
  return match ? Number(match[1]) : null;
}
