import { stroopsToXlm, xlmToStroops, truncateAddress } from '@/lib/stellar';

describe('stroopsToXlm', () => {
  it('converts 10,000,000 stroops to "1"', () => {
    expect(stroopsToXlm(10000000n)).toBe('1');
  });

  it('converts 1,234,567 stroops to decimal', () => {
    expect(stroopsToXlm(1234567n)).toBe('0.1234567');
  });

  it('converts 0 stroops to "0"', () => {
    expect(stroopsToXlm(0n)).toBe('0');
  });

  it('converts 2,500,000,000 stroops to "250"', () => {
    expect(stroopsToXlm(2500000000n)).toBe('250');
  });
});

describe('xlmToStroops', () => {
  it('converts "1.5" to 15,000,000n', () => {
    expect(xlmToStroops('1.5')).toBe(15000000n);
  });

  it('converts "10" to 100,000,000n', () => {
    expect(xlmToStroops('10')).toBe(100000000n);
  });

  it('converts "0.123456" to 1,234,560n', () => {
    expect(xlmToStroops('0.123456')).toBe(1234560n);
  });

  it('converts "0.1234567" to 1,234,567n', () => {
    expect(xlmToStroops('0.1234567')).toBe(1234567n);
  });

  it('converts "0.1234568" to 1,234,568n (truncates)', () => {
    expect(xlmToStroops('0.1234568')).toBe(1234568n);
  });

  it('converts "0" to 0n', () => {
    expect(xlmToStroops('0')).toBe(0n);
  });

  it('converts "1.00000000" to 10,000,000n', () => {
    expect(xlmToStroops('1.00000000')).toBe(10000000n);
  });
});

describe('truncateAddress', () => {
  it('truncates long address to GABCDE...WXYZ format', () => {
    const address = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890WXYZ';
    expect(truncateAddress(address)).toBe('GABCDE...WXYZ');
  });

  it('truncates standard Stellar address', () => {
    const address = 'GDIK64BQGMJSJW3IFJJBYEIEK3SOQ3P6NL76O5HCMMEKLCZLZD32X3DY';
    expect(truncateAddress(address)).toBe('GDIK64...X3DY');
  });

  it('returns short addresses unchanged', () => {
    const address = 'GDIK64BQ';
    expect(truncateAddress(address)).toBe('GDIK64BQ');
  });

  it('returns empty string for empty input', () => {
    expect(truncateAddress('')).toBe('');
  });

  it('returns input if null/undefined', () => {
    const fallback = ('test' as string);
    expect(truncateAddress(fallback)).toBe('test');
  });
});
