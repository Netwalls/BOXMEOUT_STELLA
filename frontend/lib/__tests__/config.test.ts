import * as config from '../config';

describe('Config', () => {
  it('provides defaults', () => {
    expect(config.NETWORK).toBeDefined();
  });

  it('validates required env vars', () => {
    expect(() => config.getConfig?.()).not.toThrow();
  });

  it('validates network values', () => {
    expect(['testnet', 'mainnet']).toContain(config.NETWORK);
  });
});
