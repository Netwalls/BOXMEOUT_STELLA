import { randomBytes, createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a cryptographically secure nonce using UUID v4
 */
export function generateNonce(): string {
  return uuidv4();
}

/**
 * Generate a random token ID for refresh tokens
 */
export function generateTokenId(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Hash a token for secure storage (used for refresh token lookup)
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Build the message that users will sign with their Stellar wallet
 * This message is displayed in the wallet UI when the user signs
 */
export function buildSignatureMessage(
  nonce: string,
  timestamp: number,
  ttlSeconds: number
): string {
  return [
    'BoxMeOut Stella Authentication',
    '',
    `Nonce: ${nonce}`,
    `Timestamp: ${timestamp}`,
    `Valid for: ${ttlSeconds} seconds`,
    '',
    'Sign this message to authenticate with BoxMeOut Stella.',
    'This signature will not trigger any blockchain transaction.',
  ].join('\n');
}

/**
 * Generate a random secure string of specified length
 */
export function generateSecureString(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Create a SHA-256 hash of data
 */
export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}
