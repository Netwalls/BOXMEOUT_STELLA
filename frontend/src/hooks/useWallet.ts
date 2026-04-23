import { useState, useEffect, useCallback } from 'react';
import { connectWallet, disconnectWallet, getConnectedAddress, getWalletBalance } from '../services/wallet';
import { useAppStore } from '../store';

export interface UseWalletResult {
  address: string | null;
  balance: number | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const STORAGE_KEY = 'boxmeout_wallet_address';

export function useWallet(): UseWalletResult {
  const { walletAddress, walletBalance, isConnecting, setWallet, clearWallet } = useAppStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = getConnectedAddress();
    if (stored) {
      getWalletBalance().then((bal) => setWallet(stored, bal)).catch(() => {});
    }
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    useAppStore.setState({ isConnecting: true });
    try {
      const address = await connectWallet();
      const balance = await getWalletBalance();
      localStorage.setItem(STORAGE_KEY, address);
      setWallet(address, balance);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to connect wallet');
    } finally {
      useAppStore.setState({ isConnecting: false });
    }
  }, [setWallet]);

  const disconnect = useCallback(() => {
    disconnectWallet();
    localStorage.removeItem(STORAGE_KEY);
    clearWallet();
  }, [clearWallet]);

  return {
    address: walletAddress,
    balance: walletBalance,
    isConnected: !!walletAddress,
    isConnecting,
    error,
    connect,
    disconnect,
  };
}
