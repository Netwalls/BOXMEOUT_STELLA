"use client";

import { useState, useCallback } from "react";
import { isConnected, getPublicKey, setAllowed } from "@stellar/freighter-api";

// Freighter v2 API returns objects with optional error fields rather than throwing.
type ConnectedResult = { isConnected: boolean } | { error: string };
type AllowedResult = { isAllowed: boolean } | { error: string };
type PublicKeyResult = { publicKey: string } | { error: string };

export interface UseWalletResult {
  address: string | null;
  isConnected: boolean;
  walletNotInstalled: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  signTransaction: (xdr: string) => Promise<string>;
}

export function useWallet(): UseWalletResult {
  const [address, setAddress] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [walletNotInstalled, setWalletNotInstalled] = useState(false);

  const connect = useCallback(async () => {
    try {
      const connResult: ConnectedResult = await isConnected();

      if ("error" in connResult) {
        setWalletNotInstalled(true);
        return;
      }

      if (!connResult.isConnected) {
        const allowResult: AllowedResult = await setAllowed();
        if ("error" in allowResult || !allowResult.isAllowed) {
          setWalletNotInstalled(true);
          return;
        }
      }

      const pkResult: PublicKeyResult = await getPublicKey();
      if ("error" in pkResult) {
        setWalletNotInstalled(true);
        return;
      }

      setAddress(pkResult.publicKey);
      setConnected(true);
      setWalletNotInstalled(false);
    } catch {
      setWalletNotInstalled(true);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setConnected(false);
  }, []);

  const signTransaction = useCallback(async (_xdr: string): Promise<string> => {
    throw new Error("signTransaction not implemented");
  }, []);

  return {
    address,
    isConnected: connected,
    walletNotInstalled,
    connect,
    disconnect,
    signTransaction,
  };
}
