/**
 * Unit tests for useWallet hook.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useWallet } from '../../hooks/useWallet';
import { useAppStore } from '../../store';

// Mock wallet service
const mockConnectWallet = jest.fn<() => Promise<string>>();
const mockDisconnectWallet = jest.fn<() => void>();
const mockGetConnectedAddress = jest.fn<() => string | null>();
const mockGetWalletBalance = jest.fn<() => Promise<number>>();

jest.mock('../../services/wallet', () => ({
  connectWallet: () => mockConnectWallet(),
  disconnectWallet: () => mockDisconnectWallet(),
  getConnectedAddress: () => mockGetConnectedAddress(),
  getWalletBalance: () => mockGetWalletBalance(),
}));

const STORAGE_KEY = 'boxmeout_wallet_address';

describe('useWallet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    // Reset zustand store
    useAppStore.setState({
      walletAddress: null,
      walletBalance: null,
      isConnecting: false,
    });
    mockGetConnectedAddress.mockReturnValue(null);
    mockGetWalletBalance.mockResolvedValue(100);
    mockDisconnectWallet.mockReturnValue(undefined);
  });

  describe('initial state', () => {
    it('starts disconnected with no address or balance', () => {
      const { result } = renderHook(() => useWallet());
      expect(result.current.address).toBeNull();
      expect(result.current.balance).toBeNull();
      expect(result.current.isConnected).toBe(false);
      expect(result.current.isConnecting).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('connection persistence across page refreshes', () => {
    it('restores address and fetches balance from localStorage on mount', async () => {
      mockGetConnectedAddress.mockReturnValue('GABC123');
      mockGetWalletBalance.mockResolvedValue(42);

      const { result } = renderHook(() => useWallet());

      await waitFor(() => {
        expect(result.current.address).toBe('GABC123');
      });

      expect(result.current.balance).toBe(42);
      expect(result.current.isConnected).toBe(true);
    });

    it('stays disconnected when localStorage is empty', async () => {
      mockGetConnectedAddress.mockReturnValue(null);

      const { result } = renderHook(() => useWallet());

      // Give useEffect a chance to run
      await act(async () => {});

      expect(result.current.address).toBeNull();
      expect(result.current.isConnected).toBe(false);
    });
  });

  describe('connect()', () => {
    it('sets isConnecting true during connection flow', async () => {
      let resolveConnect!: (v: string) => void;
      mockConnectWallet.mockReturnValue(new Promise((r) => { resolveConnect = r; }));

      const { result } = renderHook(() => useWallet());

      act(() => { result.current.connect(); });

      expect(result.current.isConnecting).toBe(true);

      await act(async () => { resolveConnect('GABC123'); });

      expect(result.current.isConnecting).toBe(false);
    });

    it('sets address and balance after successful connect', async () => {
      mockConnectWallet.mockResolvedValue('GABC123');
      mockGetWalletBalance.mockResolvedValue(55);

      const { result } = renderHook(() => useWallet());

      await act(async () => { await result.current.connect(); });

      expect(result.current.address).toBe('GABC123');
      expect(result.current.balance).toBe(55);
      expect(result.current.isConnected).toBe(true);
    });

    it('stores address in localStorage after connect', async () => {
      mockConnectWallet.mockResolvedValue('GABC123');

      const { result } = renderHook(() => useWallet());

      await act(async () => { await result.current.connect(); });

      expect(localStorage.getItem(STORAGE_KEY)).toBe('GABC123');
    });

    it('sets error and clears isConnecting on connect failure', async () => {
      mockConnectWallet.mockRejectedValue(new Error('WalletNotInstalledError'));

      const { result } = renderHook(() => useWallet());

      await act(async () => { await result.current.connect(); });

      expect(result.current.error).toBe('WalletNotInstalledError');
      expect(result.current.isConnecting).toBe(false);
      expect(result.current.isConnected).toBe(false);
    });
  });

  describe('disconnect()', () => {
    it('clears address and balance on disconnect', async () => {
      mockConnectWallet.mockResolvedValue('GABC123');
      mockGetWalletBalance.mockResolvedValue(55);

      const { result } = renderHook(() => useWallet());
      await act(async () => { await result.current.connect(); });

      act(() => { result.current.disconnect(); });

      expect(result.current.address).toBeNull();
      expect(result.current.balance).toBeNull();
      expect(result.current.isConnected).toBe(false);
    });

    it('removes address from localStorage on disconnect', async () => {
      mockConnectWallet.mockResolvedValue('GABC123');

      const { result } = renderHook(() => useWallet());
      await act(async () => { await result.current.connect(); });

      act(() => { result.current.disconnect(); });

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('calls disconnectWallet service on disconnect', async () => {
      mockConnectWallet.mockResolvedValue('GABC123');

      const { result } = renderHook(() => useWallet());
      await act(async () => { await result.current.connect(); });

      act(() => { result.current.disconnect(); });

      expect(mockDisconnectWallet).toHaveBeenCalledTimes(1);
    });
  });
});
