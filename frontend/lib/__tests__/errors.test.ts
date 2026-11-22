import * as errors from '../errors';

describe('Errors', () => {
  it('maps known error codes', () => {
    const msg = errors.getErrorMessage?.('INSUFFICIENT_BALANCE');
    expect(msg).toBeTruthy();
  });

  it('handles unknown codes safely', () => {
    const msg = errors.getErrorMessage?.('UNKNOWN');
    expect(msg).toBeTruthy();
  });

  it('handles non-Error inputs', () => {
    const msg = errors.getErrorMessage?.(null);
    expect(msg).toBeTruthy();
  });
});
