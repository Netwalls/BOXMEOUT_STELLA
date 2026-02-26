import {
  Keypair,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Operation,
  Asset,
  Horizon,
} from '@stellar/stellar-sdk';
import { AuthError } from '../types/auth.types.js';
import { logger } from '../utils/logger.js';

const STELLAR_HORIZON_URL =
  process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const STELLAR_NETWORK = process.env.STELLAR_NETWORK || 'testnet';
const USDC_ISSUER =
  process.env.USDC_ISSUER ||
  'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'; // Circle testnet issuer

/**
 * Service for Stellar blockchain operations
 * Handles signature verification and public key validation
 */
export class StellarService {
  private _server: Horizon.Server | null = null;
  private _adminKeypair: Keypair | null = null;
  private _initialized = false;

  constructor() {
    // Constructor is now empty for lazy initialization
  }

  /**
   * Lazy initializer — only runs on first call to sendUsdc().
   * This avoids Horizon.Server construction on module load (which breaks tests).
   */
  private init(): void {
    if (this._initialized) return;
    this._server = new Horizon.Server(STELLAR_HORIZON_URL);
    const secret = process.env.ADMIN_WALLET_SECRET;
    this._adminKeypair = secret ? Keypair.fromSecret(secret) : null;
    this._initialized = true;
  }

  /**
   * Send USDC to a destination wallet address.
   * Signed by the platform admin keypair.
   *
   * @param destination - Stellar public key of the recipient
   * @param amount - Amount in USDC (e.g. "10.50")
   * @param memo - Optional memo (max 28 bytes)
   * @returns txHash on success
   */
  async sendUsdc(
    destination: string,
    amount: string,
    memo?: string
  ): Promise<{ txHash: string }> {
    this.init();

    if (!this._adminKeypair) {
      throw new Error('ADMIN_WALLET_SECRET not configured — cannot send USDC');
    }

    const usdcAsset = new Asset('USDC', USDC_ISSUER);

    try {
      const sourceAccount = await this._server!.loadAccount(
        this._adminKeypair.publicKey()
      );

      const txBuilder = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase:
          STELLAR_NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET,
      }).addOperation(
        Operation.payment({
          destination,
          asset: usdcAsset,
          amount, // string, e.g. "10.50"
        })
      );

      if (memo) {
        txBuilder.addMemo({ type: 'text', value: memo } as any);
      }

      const tx = txBuilder.setTimeout(30).build();
      tx.sign(this._adminKeypair);

      const response = await this._server!.submitTransaction(tx);

      const txHash = (response as any).hash || (response as any).id;
      logger.info('USDC sent successfully', { destination, amount, txHash });

      return { txHash };
    } catch (error) {
      logger.error('Failed to send USDC', { destination, amount, error });
      throw new Error(
        `USDC transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

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
      logger.error('Signature verification error', { error });
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
    return `${publicKey.slice(0, prefixLength)}...${publicKey.slice(
      -suffixLength
    )}`;
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
