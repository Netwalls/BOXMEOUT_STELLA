import { describe, it, expect } from '@jest/globals';
import {
  sanitizeString,
  sanitizeMarketTitle,
  sanitizeMarketDescription,
  validateNumericInput,
  validateStellarAddress,
  validateOutcome,
  validateUsdcAmount,
} from '../sanitization';

describe('Sanitization Utilities', () => {
  describe('sanitizeString', () => {
    it('should escape HTML special characters', () => {
      const input = '<script>alert("xss")</script>';
      const result = sanitizeString(input);
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
    });

    it('should remove null bytes', () => {
      const input = 'test\0string';
      const result = sanitizeString(input);
      expect(result).not.toContain('\0');
      expect(result).toBe('teststring');
    });

    it('should remove control characters', () => {
      const input = 'test\x01\x02string';
      const result = sanitizeString(input);
      expect(result).toBe('teststring');
    });
  });

  describe('sanitizeMarketTitle', () => {
    it('should allow alphanumeric and basic punctuation', () => {
      const input = 'Will Bitcoin reach $100k by 2025?';
      const result = sanitizeMarketTitle(input);
      expect(result).toBe('Will Bitcoin reach $100k by 2025?');
    });

    it('should remove dangerous characters', () => {
      const input = 'Test<script>alert(1)</script>Market';
      const result = sanitizeMarketTitle(input);
      expect(result).not.toContain('<script>');
    });

    it('should collapse multiple spaces', () => {
      const input = 'Test    Market    Title';
      const result = sanitizeMarketTitle(input);
      expect(result).toBe('Test Market Title');
    });
  });

  describe('validateNumericInput', () => {
    it('should accept valid positive numbers', () => {
      expect(validateNumericInput(100)).toBe(100);
      expect(validateNumericInput(0.5)).toBe(0.5);
    });

    it('should reject negative numbers', () => {
      expect(() => validateNumericInput(-10)).toThrow('Negative values not allowed');
    });

    it('should reject NaN', () => {
      expect(() => validateNumericInput(NaN)).toThrow('Invalid numeric value');
    });

    it('should reject Infinity', () => {
      expect(() => validateNumericInput(Infinity)).toThrow('Invalid numeric value');
    });

    it('should enforce min/max bounds', () => {
      expect(() => validateNumericInput(5, { min: 10 })).toThrow('Value must be at least 10');
      expect(() => validateNumericInput(100, { max: 50 })).toThrow('Value must not exceed 50');
    });

    it('should reject decimals when not allowed', () => {
      expect(() => validateNumericInput(10.5, { allowDecimals: false })).toThrow(
        'Decimal values not allowed'
      );
    });

    it('should detect overflow', () => {
      expect(() => validateNumericInput(Number.MAX_SAFE_INTEGER + 1)).toThrow(
        'Numeric overflow detected'
      );
    });
  });

  describe('validateStellarAddress', () => {
    it('should accept valid Stellar addresses', () => {
      const validAddress = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
      expect(validateStellarAddress(validAddress)).toBe(true);
    });

    it('should reject addresses not starting with G', () => {
      const invalidAddress = 'ABRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
      expect(validateStellarAddress(invalidAddress)).toBe(false);
    });

    it('should reject addresses with wrong length', () => {
      const shortAddress = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX';
      expect(validateStellarAddress(shortAddress)).toBe(false);
    });

    it('should reject addresses with invalid characters', () => {
      const invalidAddress = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2!';
      expect(validateStellarAddress(invalidAddress)).toBe(false);
    });

    it('should reject non-string inputs', () => {
      expect(validateStellarAddress(null as any)).toBe(false);
      expect(validateStellarAddress(undefined as any)).toBe(false);
      expect(validateStellarAddress(123 as any)).toBe(false);
    });
  });

  describe('validateOutcome', () => {
    it('should accept 0 and 1', () => {
      expect(validateOutcome(0)).toBe(0);
      expect(validateOutcome(1)).toBe(1);
    });

    it('should reject other numbers', () => {
      expect(() => validateOutcome(2)).toThrow('Outcome must be 0 or 1');
      expect(() => validateOutcome(-1)).toThrow('Outcome must be 0 or 1');
    });

    it('should reject non-integers', () => {
      expect(() => validateOutcome(0.5)).toThrow('Outcome must be an integer');
    });

    it('should reject NaN', () => {
      expect(() => validateOutcome(NaN)).toThrow('Outcome must be an integer');
    });
  });

  describe('validateUsdcAmount', () => {
    it('should accept valid USDC amounts', () => {
      expect(validateUsdcAmount(100)).toBe(100);
      expect(validateUsdcAmount(0.0000001)).toBe(0.0000001);
    });

    it('should reject zero', () => {
      expect(() => validateUsdcAmount(0)).toThrow('Zero value not allowed');
    });

    it('should reject negative amounts', () => {
      expect(() => validateUsdcAmount(-10)).toThrow('Negative values not allowed');
    });

    it('should reject amounts exceeding max', () => {
      expect(() => validateUsdcAmount(922337203686)).toThrow('Value must not exceed');
    });

    it('should reject amounts below minimum stroop', () => {
      expect(() => validateUsdcAmount(0.00000001)).toThrow('Value must be at least');
    });
  });
});
