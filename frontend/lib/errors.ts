/**
 * F-52: Map contract error codes to user-facing messages.
 *
 * Contracts (see C-48/C-49) return numeric `ContractError` codes on failed
 * simulations. This module decodes those codes (and the raw host error
 * strings that wrap them) into friendly copy suitable for toasts.
 */

/** Numeric `ContractError` variants returned by the contracts. */
export enum ContractError {
  Unknown = 0,
  Unauthorized = 1,
  NotFound = 2,
  AlreadyExists = 3,
  InvalidInput = 4,
  InsufficientFunds = 5,
  InsufficientAllowance = 6,
  DeadlineExpired = 7,
  Paused = 8,
  Overflow = 9,
  NotInitialized = 10,
  AlreadyInitialized = 11,
  InvalidState = 12,
  Unsupported = 13,
}

/** Friendly, user-facing copy for every `ContractError` variant. */
export const CONTRACT_ERROR_MESSAGES: Record<ContractError, string> = {
  [ContractError.Unknown]:
    "Something went wrong while processing the transaction. Please try again.",
  [ContractError.Unauthorized]:
    "You are not authorized to perform this action.",
  [ContractError.NotFound]:
    "We couldn't find the requested item. It may have been removed.",
  [ContractError.AlreadyExists]:
    "This item already exists.",
  [ContractError.InvalidInput]:
    "Some of the information provided is invalid. Please review and try again.",
  [ContractError.InsufficientFunds]:
    "You don't have enough funds to complete this transaction.",
  [ContractError.InsufficientAllowance]:
    "You haven't approved enough allowance for this transaction.",
  [ContractError.DeadlineExpired]:
    "This transaction has expired. Please try again.",
  [ContractError.Paused]:
    "This feature is temporarily paused. Please try again later.",
  [ContractError.Overflow]:
    "The amount is too large to process.",
  [ContractError.NotInitialized]:
    "This contract hasn't been set up yet. Please try again later.",
  [ContractError.AlreadyInitialized]:
    "This contract has already been set up.",
  [ContractError.InvalidState]:
    "This action can't be performed in the current state.",
  [ContractError.Unsupported]:
    "This operation isn't supported.",
};

/** Fallback copy when no specific contract error can be decoded. */
export const DEFAULT_ERROR_MESSAGE =
  "Something went wrong. Please try again.";

/**
 * Extract a numeric `ContractError` code from a raw host/simulation error.
 *
 * Host errors surface the code in a few shapes, e.g.:
 *   - `Error(Contract, #5)`
 *   - `HostError: Error(Contract, #5)`
 *   - `contract error: 5`
 *   - a bare numeric code
 */
export function decodeContractError(error: unknown): ContractError | null {
  if (error == null) return null;

  if (typeof error === "number") {
    return isContractError(error) ? error : null;
  }

  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : typeof (error as { message?: unknown }).message === "string"
          ? (error as { message: string }).message
          : null;

  if (!message) return null;

  // Matches `Error(Contract, #5)` and similar host error wrappers.
  const contractMatch = message.match(/Error\(\s*Contract\s*,\s*#?(\d+)\s*\)/i);
  if (contractMatch) {
    const code = Number(contractMatch[1]);
    return isContractError(code) ? code : null;
  }

  // Matches `contract error: 5` / `contracterror 5` style messages.
  const labelledMatch = message.match(/contract\s*error[:\s#]*(\d+)/i);
  if (labelledMatch) {
    const code = Number(labelledMatch[1]);
    return isContractError(code) ? code : null;
  }

  return null;
}

/**
 * Map any thrown/simulated error to a friendly, user-facing message.
 * Falls back to the raw message when it is already human-readable, and to
 * {@link DEFAULT_ERROR_MESSAGE} otherwise.
 */
export function getErrorMessage(error: unknown): string {
  const code = decodeContractError(error);
  if (code !== null) {
    return CONTRACT_ERROR_MESSAGES[code] ?? DEFAULT_ERROR_MESSAGE;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return DEFAULT_ERROR_MESSAGE;
}

function isContractError(value: number): value is ContractError {
  return Number.isInteger(value) && value in CONTRACT_ERROR_MESSAGES;
}
