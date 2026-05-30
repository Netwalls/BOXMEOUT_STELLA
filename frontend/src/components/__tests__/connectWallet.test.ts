/**
 * Unit tests for connectWallet() in wallet service.
 */

import {
  connectWallet,
  WalletNotInstalledError,
  WalletConnectionError,
} from '../../services/wallet';

const STORAGE_KEY = 'boxmeout_wallet_address';

function setWindow(overrides: Record<string, unknown>) {
  Object.assign(window, overrides);
}

function clearWallets() {
  delete (window as any).freighter;
  delete (window as any).albedo;
}

describe('connectWallet', () => {
  beforeEach(() => {
    clearWallets();
    localStorage.clear();
  });

  afterEach(() => {
    clearWallets();
  });

  describe('Freighter', () => {
    it('returns the public key on success', async () => {
      setWindow({
        freighter: {
          requestAccess: jest.fn().mockResolvedValue(undefined),
          getPublicKey: jest.fn().mockResolvedValue({ publicKey: 'GABC123' }),
        },
      });

      const address = await connectWallet();
      expect(address).toBe('GABC123');
    });

    it('stores the address in localStorage', async () => {
      setWindow({
        freighter: {
          requestAccess: jest.fn().mockResolvedValue(undefined),
          getPublicKey: jest.fn().mockResolvedValue({ publicKey: 'GABC123' }),
        },
      });

      await connectWallet();
      expect(localStorage.getItem(STORAGE_KEY)).toBe('GABC123');
    });

    it('throws WalletConnectionError when requestAccess is rejected', async () => {
      setWindow({
        freighter: {
          requestAccess: jest.fn().mockRejectedValue(new Error('User denied')),
          getPublicKey: jest.fn(),
        },
      });

      await expect(connectWallet()).rejects.toBeInstanceOf(WalletConnectionError);
    });

    it('throws WalletConnectionError when getPublicKey is rejected', async () => {
      setWindow({
        freighter: {
          requestAccess: jest.fn().mockResolvedValue(undefined),
          getPublicKey: jest.fn().mockRejectedValue(new Error('Denied')),
        },
      });

      await expect(connectWallet()).rejects.toBeInstanceOf(WalletConnectionError);
    });

    it('WalletConnectionError preserves the original message', async () => {
      setWindow({
        freighter: {
          requestAccess: jest.fn().mockRejectedValue(new Error('User denied access')),
          getPublicKey: jest.fn(),
        },
      });

      await expect(connectWallet()).rejects.toThrow('User denied access');
    });
  });

  describe('Albedo (fallback)', () => {
    it('returns the public key on success', async () => {
      setWindow({
        albedo: {
          publicKey: jest.fn().mockResolvedValue({ pubkey: 'GXYZ789' }),
        },
      });

      const address = await connectWallet();
      expect(address).toBe('GXYZ789');
    });

    it('stores the address in localStorage', async () => {
      setWindow({
        albedo: {
          publicKey: jest.fn().mockResolvedValue({ pubkey: 'GXYZ789' }),
        },
      });

      await connectWallet();
      expect(localStorage.getItem(STORAGE_KEY)).toBe('GXYZ789');
    });

    it('throws WalletConnectionError when user rejects', async () => {
      setWindow({
        albedo: {
          publicKey: jest.fn().mockRejectedValue(new Error('Rejected')),
        },
      });

      await expect(connectWallet()).rejects.toBeInstanceOf(WalletConnectionError);
    });

    it('prefers Freighter over Albedo when both are present', async () => {
      setWindow({
        freighter: {
          requestAccess: jest.fn().mockResolvedValue(undefined),
          getPublicKey: jest.fn().mockResolvedValue({ publicKey: 'GFREIGHTER' }),
        },
        albedo: {
          publicKey: jest.fn().mockResolvedValue({ pubkey: 'GALBEDO' }),
        },
      });

      const address = await connectWallet();
      expect(address).toBe('GFREIGHTER');
    });
  });

  describe('No wallet installed', () => {
    it('throws WalletNotInstalledError when no wallet is found', async () => {
      await expect(connectWallet()).rejects.toBeInstanceOf(WalletNotInstalledError);
    });

    it('error message includes Freighter install link', async () => {
      await expect(connectWallet()).rejects.toThrow('https://freighter.app');
    });
  });
});
