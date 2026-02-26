import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { StellarService } from '../../src/services/stellar.service.js';
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../src/utils/jwt.js';
import {
  generateNonce,
  buildSignatureMessage,
} from '../../src/utils/crypto.js';
import { AuthError } from '../../src/types/auth.types.js';

describe('StellarService', () => {
  const stellarService = new StellarService();

  describe('isValidPublicKey', () => {
    it('should return true for valid Stellar public key', () => {
      const keypair = Keypair.random();
      expect(stellarService.isValidPublicKey(keypair.publicKey())).toBe(true);
    });

    it('should return false for invalid public key format', () => {
      expect(stellarService.isValidPublicKey('invalid')).toBe(false);
      expect(stellarService.isValidPublicKey('')).toBe(false);
      expect(stellarService.isValidPublicKey('GXXX')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(stellarService.isValidPublicKey(null as any)).toBe(false);
      expect(stellarService.isValidPublicKey(undefined as any)).toBe(false);
    });
  });

  describe('verifySignature', () => {
    it('should verify valid signature', () => {
      const keypair = Keypair.random();
      const message = 'Test message to sign';
      const messageBuffer = Buffer.from(message, 'utf-8');
      const signature = keypair.sign(messageBuffer);
      const signatureBase64 = signature.toString('base64');

      const result = stellarService.verifySignature(
        keypair.publicKey(),
        message,
        signatureBase64
      );

      expect(result).toBe(true);
    });

    it('should reject invalid signature', () => {
      const keypair1 = Keypair.random();
      const keypair2 = Keypair.random();
      const message = 'Test message';
      const messageBuffer = Buffer.from(message, 'utf-8');
      const signature = keypair1.sign(messageBuffer);
      const signatureBase64 = signature.toString('base64');

      // Verify with wrong public key
      const result = stellarService.verifySignature(
        keypair2.publicKey(),
        message,
        signatureBase64
      );

      expect(result).toBe(false);
    });

    it('should throw for invalid public key format', () => {
      expect(() => {
        stellarService.verifySignature('invalid', 'message', 'signature');
      }).toThrow(AuthError);
    });

    it('should throw for invalid signature length', () => {
      const keypair = Keypair.random();
      expect(() => {
        stellarService.verifySignature(keypair.publicKey(), 'message', 'short');
      }).toThrow(AuthError);
    });
  });
});

describe('JWT Utils', () => {
  describe('Access Token', () => {
    it('should sign and verify access token', () => {
      const payload = {
        userId: 'user-123',
        publicKey: 'GBXXXXXX',
        tier: 'BEGINNER' as const,
      };

      const token = signAccessToken(payload);
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');

      const decoded = verifyAccessToken(token);
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.publicKey).toBe(payload.publicKey);
      expect(decoded.tier).toBe(payload.tier);
      expect(decoded.type).toBe('access');
    });

    it('should reject invalid token', () => {
      expect(() => verifyAccessToken('invalid-token')).toThrow(AuthError);
    });

    it('should reject refresh token as access token', () => {
      const refreshToken = signRefreshToken({
        userId: 'user-123',
        tokenId: 'token-123',
      });
      expect(() => verifyAccessToken(refreshToken)).toThrow(AuthError);
    });
  });

  describe('Refresh Token', () => {
    it('should sign and verify refresh token', () => {
      const payload = {
        userId: 'user-123',
        tokenId: 'token-456',
      };

      const token = signRefreshToken(payload);
      expect(token).toBeTruthy();

      const decoded = verifyRefreshToken(token);
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.tokenId).toBe(payload.tokenId);
      expect(decoded.type).toBe('refresh');
    });

    it('should reject access token as refresh token', () => {
      const accessToken = signAccessToken({
        userId: 'user-123',
        publicKey: 'GBXX',
        tier: 'BEGINNER',
      });
      expect(() => verifyRefreshToken(accessToken)).toThrow(AuthError);
    });
  });
});

describe('Crypto Utils', () => {
  it('should generate unique nonces', () => {
    const nonce1 = generateNonce();
    const nonce2 = generateNonce();

    expect(nonce1).toBeTruthy();
    expect(nonce2).toBeTruthy();
    expect(nonce1).not.toBe(nonce2);
  });

  it('should build consistent signature message', () => {
    const nonce = 'test-nonce';
    const timestamp = 1234567890;
    const ttl = 300;

    const message = buildSignatureMessage(nonce, timestamp, ttl);

    expect(message).toContain('BoxMeOut Stella Authentication');
    expect(message).toContain(nonce);
    expect(message).toContain(String(timestamp));
    expect(message).toContain(String(ttl));
  });
});
