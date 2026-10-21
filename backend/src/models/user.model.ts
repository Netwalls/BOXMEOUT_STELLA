/**
 * User model types.
 *
 * A User is identified solely by their Stellar public key (G… address).
 * No additional onboarding is required — any address that interacts with
 * BOXMEOUT contracts is automatically represented in the User table.
 */

/** Regex validating a Stellar public key (starts with G, 56 chars, base32). */
export const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

/**
 * Validates that a given string is a well-formed Stellar public key.
 * Returns `true` when the address passes format validation.
 */
export function isValidStellarAddress(address: string): boolean {
  return STELLAR_ADDRESS_RE.test(address);
}
