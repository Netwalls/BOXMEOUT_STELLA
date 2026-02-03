import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
} from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// Encryption configuration
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY ||
  'your-32-byte-secret-key-change-in-production!!'; // Must be 32 bytes

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
 * Generate a cryptographically secure salt for commit-reveal predictions
 */
export function generateSalt(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Create a commitment hash from prediction data and salt
 */
export function createCommitmentHash(
  userId: string,
  marketId: string,
  predictedOutcome: number,
  salt: string
): string {
  return createHash('sha256')
    .update(`${userId}:${marketId}:${predictedOutcome}:${salt}`)
    .digest('hex');
}

/**
 * Encrypt sensitive data (like salt) for database storage
 * Returns { encrypted: string, iv: string }
 */
export function encrypt(text: string): { encrypted: string; iv: string } {
  const iv = randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    encrypted,
    iv: iv.toString('hex'),
  };
}

/**
 * Decrypt encrypted data from database
 */
export function decrypt(encrypted: string, ivHex: string): string {
  const iv = Buffer.from(ivHex, 'hex');
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Create a SHA-256 hash of data
 */
export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}
