import { Keypair } from '@stellar/stellar-sdk';
import { AuthError } from '../types/auth.types.js';

/**
 * Service for Stellar blockchain operations
 * Handles signature verification and public key validation
 */
export class StellarService {
  /**
   * Validate Stellar public key format
   * Stellar public keys start with 'G' and are 56 characters (base32 encoded)
   */
  isValidPublicKey(publicKey: string): boolean {
    if (!publicKey || typeof publicKey !== 'string') {
      return false;
    }

    // Stellar public keys: G + 55 base32 characters (uppercase letters A-Z, digits 2-7)
    if (!/^G[A-Z2-7]{55}$/.test(publicKey)) {
      return false;
    }

    // Additional validation using Stellar SDK to check checksum
    try {
      Keypair.fromPublicKey(publicKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Verify a Stellar ed25519 signature
   *
   * How it works:
   * 1. Stellar wallets sign messages using the ed25519 algorithm
   * 2. The signature is created by: sign(message, privateKey)
   * 3. We verify using: verify(message, signature, publicKey)
   *
   * @param publicKey - Stellar public key (starts with G, 56 chars)
   * @param message - Original message that was signed
   * @param signature - Base64 encoded signature from wallet
   * @returns true if signature is valid, false otherwise
   * @throws AuthError if public key or signature format is invalid
   */
  verifySignature(
    publicKey: string,
    message: string,
    signature: string
  ): boolean {
    // Validate public key format
    if (!this.isValidPublicKey(publicKey)) {
      throw new AuthError(
        'INVALID_PUBLIC_KEY',
        'Invalid Stellar public key format',
        400
      );
    }

    // Validate signature format (should be base64 encoded)
    if (!signature || typeof signature !== 'string') {
      throw new AuthError(
        'INVALID_SIGNATURE_FORMAT',
        'Signature must be a non-empty string',
        400
      );
    }

    try {
      // Create Keypair from public key (for verification only)
      const keypair = Keypair.fromPublicKey(publicKey);

      // Decode signature from base64 to Buffer
      const signatureBuffer = Buffer.from(signature, 'base64');

      // ed25519 signatures are exactly 64 bytes
      if (signatureBuffer.length !== 64) {
        throw new AuthError(
          'INVALID_SIGNATURE_LENGTH',
          `Signature must be 64 bytes, got ${signatureBuffer.length}`,
          400
        );
      }

      // Convert message to Buffer (UTF-8 encoding)
      const messageBuffer = Buffer.from(message, 'utf-8');

      // Verify signature using Stellar SDK's ed25519 verification
      // Returns true if the signature was created by the private key
      // corresponding to this public key
      return keypair.verify(messageBuffer, signatureBuffer);
    } catch (error) {
      // Re-throw AuthErrors
      if (error instanceof AuthError) {
        throw error;
      }

      // Log unexpected errors but return false for security
      // (don't leak internal error details)
      console.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * Extract shortened display format from public key
   * Example: "GBXXXX...XXXXXX" for UI display
   */
  shortenPublicKey(
    publicKey: string,
    prefixLength: number = 6,
    suffixLength: number = 6
  ): string {
    if (!publicKey || publicKey.length < prefixLength + suffixLength + 3) {
      return publicKey;
    }
    return `${publicKey.slice(0, prefixLength)}...${publicKey.slice(-suffixLength)}`;
  }

  /**
   * Check if a string looks like a valid Stellar public key (quick check)
   * Use isValidPublicKey() for full validation with checksum
   */
  looksLikePublicKey(str: string): boolean {
    return typeof str === 'string' && str.startsWith('G') && str.length === 56;
  }
}

// Singleton instance for convenience
export const stellarService = new StellarService();
