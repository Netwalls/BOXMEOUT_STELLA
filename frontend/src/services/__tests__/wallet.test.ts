/**
 * Unit tests for xlmToStroops and stroopsToXlm conversion functions.
 * 1 XLM = 10,000,000 stroops
 */

import { xlmToStroops, stroopsToXlm } from '../wallet';

describe('xlmToStroops', () => {
  describe('Basic conversions', () => {
    it('should convert 1 XLM to 10000000 stroops', () => {
      expect(xlmToStroops(1)).toBe(10000000n);
    });

    it('should convert 0.0000001 XLM to 1 stoop', () => {
      expect(xlmToStroops(0.0000001)).toBe(1n);
    });

    it('should convert 0 XLM to 0 stroops', () => {
      expect(xlmToStroops(0)).toBe(0n);
    });

    it('should convert 2.5 XLM to 25000000 stroops', () => {
      expect(xlmToStroops(2.5)).toBe(25000000n);
    });
  });

  describe('Edge cases - very small amounts', () => {
    it('should convert 0.00000001 XLM (1e-8, smallest non-zero)', () => {
      expect(xlmToStroops(0.00000001)).toBe(0n); // Below precision
    });

    it('should convert 0.0000010 XLM to 10 stroops', () => {
      expect(xlmToStroops(0.000001)).toBe(10n);
    });

    it('should convert 0.00000100 XLM to 10 stroops', () => {
      expect(xlmToStroops(0.0000010)).toBe(10n);
    });
  });

  describe('Edge cases - very large amounts', () => {
    it('should convert 1000000 XLM to 10000000000000 stroops', () => {
      expect(xlmToStroops(1000000)).toBe(10000000000000n);
    });

    it('should convert 922337203685.4775807 XLM (near MAX_INT64 in stroops)', () => {
      // This is close to the maximum safe integer for JavaScript when divided
      const result = xlmToStroops(922337203685.4775807);
      expect(result).toBe(9223372036854775807n);
    });

    it('should handle very large whole numbers', () => {
      expect(xlmToStroops(999999999)).toBe(9999999990000000n);
    });
  });

  describe('Precision handling', () => {
    it('should handle exactly 7 decimal places', () => {
      expect(xlmToStroops(0.1234567)).toBe(1234567n);
    });

    it('should truncate beyond 7 decimal places', () => {
      // 1.123456789 should truncate to 1.1234567
      expect(xlmToStroops(1.123456789)).toBe(11234567n);
    });

    it('should handle trailing zeros', () => {
      expect(xlmToStroops(0.1000000)).toBe(1000000n);
    });

    it('should handle mixed decimal lengths', () => {
      expect(xlmToStroops(0.12345)).toBe(1234500n);
    });
  });
});

describe('stroopsToXlm', () => {
  describe('Basic conversions', () => {
    it('should convert 10000000 stroops to 1 XLM', () => {
      expect(stroopsToXlm(10000000n)).toBe(1);
    });

    it('should convert "123456789" stroops to 12.3456789 XLM', () => {
      expect(stroopsToXlm('123456789')).toBe(12.3456789);
    });

    it('should convert 0 stroops to 0 XLM', () => {
      expect(stroopsToXlm(0n)).toBe(0);
    });

    it('should convert "0" stroops to 0 XLM', () => {
      expect(stroopsToXlm('0')).toBe(0);
    });
  });

  describe('BigInt input', () => {
    it('should convert bigint 1 stoop to 0.0000001 XLM', () => {
      expect(stroopsToXlm(1n)).toBe(0.0000001);
    });

    it('should convert bigint 25000000 to 2.5 XLM', () => {
      expect(stroopsToXlm(25000000n)).toBe(2.5);
    });

    it('should convert bigint 999999999 to 99.9999999 XLM', () => {
      expect(stroopsToXlm(999999999n)).toBe(99.9999999);
    });
  });

  describe('String input', () => {
    it('should convert string "1" stoop to 0.0000001 XLM', () => {
      expect(stroopsToXlm('1')).toBe(0.0000001);
    });

    it('should convert string "10000000" to 1 XLM', () => {
      expect(stroopsToXlm('10000000')).toBe(1);
    });

    it('should convert string "999999999" to 99.9999999 XLM', () => {
      expect(stroopsToXlm('999999999')).toBe(99.9999999);
    });
  });

  describe('Edge cases - very small amounts', () => {
    it('should convert 1 stoop to 0.0000001 XLM', () => {
      expect(stroopsToXlm(1n)).toBe(0.0000001);
    });

    it('should convert 10 stroops to 0.000001 XLM', () => {
      expect(stroopsToXlm(10n)).toBe(0.000001);
    });

    it('should convert 100 stroops to 0.00001 XLM', () => {
      expect(stroopsToXlm(100n)).toBe(0.00001);
    });
  });

  describe('Edge cases - very large amounts', () => {
    it('should convert 10000000000000 stroops to 1000000 XLM', () => {
      expect(stroopsToXlm(10000000000000n)).toBe(1000000);
    });

    it('should convert near MAX_INT64 in stroops', () => {
      const maxInt64Stroops = 9223372036854775807n;
      const result = stroopsToXlm(maxInt64Stroops);
      expect(result).toBe(922337203685.4775807);
    });

    it('should handle large string amounts', () => {
      expect(stroopsToXlm('9223372036854775807')).toBe(922337203685.4775807);
    });
  });

  describe('Round-trip conversions', () => {
    it('should round-trip 1 XLM', () => {
      const stroops = xlmToStroops(1);
      const xlm = stroopsToXlm(stroops);
      expect(xlm).toBe(1);
    });

    it('should round-trip 0.0000001 XLM', () => {
      const stroops = xlmToStroops(0.0000001);
      const xlm = stroopsToXlm(stroops);
      expect(xlm).toBe(0.0000001);
    });

    it('should round-trip 12.3456789 XLM', () => {
      const stroops = xlmToStroops(12.3456789);
      const xlm = stroopsToXlm(stroops);
      expect(xlm).toBe(12.3456789);
    });

    it('should round-trip 100.23 XLM', () => {
      const stroops = xlmToStroops(100.23);
      const xlm = stroopsToXlm(stroops);
      expect(xlm).toBe(100.23);
    });
  });
});
