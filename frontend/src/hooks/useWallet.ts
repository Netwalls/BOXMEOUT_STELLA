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

export function useWallet(): UseWalletResult {
  const { walletAddress, walletBalance, isConnecting, setWallet, clearWallet } = useAppStore();
  const [error, setError] = useState<string | null>(null);

  // Restore wallet connection on mount if persisted
  useEffect(() => {
    const stored = getConnectedAddress();
    if (stored) {
      getWalletBalance().then((bal) => setWallet(stored, bal)).catch(() => {});
    }
  }, [setWallet]);

  const connect = useCallback(async () => {
    setError(null);
    useAppStore.setState({ isConnecting: true });
    try {
      const address = await connectWallet();
      const balance = await getWalletBalance();
      setWallet(address, balance);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to connect wallet');
    } finally {
      useAppStore.setState({ isConnecting: false });
    }
  }, [setWallet]);

  const disconnect = useCallback(() => {
    disconnectWallet();
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
