"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  isConnected,
  requestAccess,
  getAddress,
  getNetwork,
  signTransaction as freighterSignTransaction,
} from "@stellar/freighter-api";
import { NETWORK_PASSPHRASE } from "@/lib/stellar";

const NETWORK_POLL_INTERVAL_MS = 3000;
const PERSISTED_CONNECTION_KEY = "freighter:connected";

export class UserRejectedError extends Error {
  constructor(message = "User rejected the transaction") {
    super(message);
    this.name = "UserRejectedError";
  }
}

function isUserRejection(message: string | undefined): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes("user declined") ||
    normalized.includes("user rejected") ||
    normalized.includes("rejected by user") ||
    normalized.includes("denied by user") ||
    normalized.includes("request rejected")
  );
}

interface WalletState {
  address: string | null;
  connected: boolean;
  walletNotInstalled: boolean;
  networkPassphrase: string | null;
}

const initialState: WalletState = {
  address: null,
  connected: false,
  walletNotInstalled: false,
  networkPassphrase: null,
};

let storeState: WalletState = { ...initialState };
const listeners = new Set<() => void>();

function setStoreState(patch: Partial<WalletState>): void {
  storeState = { ...storeState, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): WalletState {
  return storeState;
}

export function __resetWalletStoreForTests(): void {
  storeState = { ...initialState };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(PERSISTED_CONNECTION_KEY);
    } catch {}
  }
  listeners.forEach((l) => l());
}

function readPersistedConnection(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PERSISTED_CONNECTION_KEY) === "true";
  } catch {
    return false;
  }
}

function persistConnection(connected: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (connected) {
      window.localStorage.setItem(PERSISTED_CONNECTION_KEY, "true");
    } else {
      window.localStorage.removeItem(PERSISTED_CONNECTION_KEY);
    }
  } catch {}
}

async function refreshNetwork(): Promise<void> {
  try {
    const netResult = await getNetwork();
    if (netResult.error) return;
    setStoreState({ networkPassphrase: netResult.networkPassphrase });
  } catch {}
}

export interface UseWalletResult {
  address: string | null;
  isConnected: boolean;
  walletNotInstalled: boolean;
  networkPassphrase?: string | null;
  isNetworkMismatched?: boolean;
  isWrongNetwork?: boolean;
  networkName?: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  signTransaction: (xdr: string) => Promise<string>;
}

const WalletContext = createContext<UseWalletResult | null>(null);

export function WalletProvider({ children }: { children: ReactNode }): JSX.Element {
  const wallet = useWallet();
  return <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>;
}

export function useWallet(): UseWalletResult {
  const context = useContext(WalletContext);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const connect = useCallback(async () => {
    try {
      const connResult = await isConnected();
      if (connResult.error || !connResult.isConnected) {
        setStoreState({ walletNotInstalled: true });
        return;
      }

      const accessResult = await requestAccess();
      if (accessResult.error || !accessResult.address) {
        setStoreState({ walletNotInstalled: true });
        return;
      }

      setStoreState({
        address: accessResult.address,
        connected: true,
        walletNotInstalled: false,
      });
      persistConnection(true);
      await refreshNetwork();
    } catch {
      setStoreState({ walletNotInstalled: true });
    }
  }, []);

  const disconnect = useCallback(() => {
    persistConnection(false);
    setStoreState({
      address: null,
      connected: false,
      networkPassphrase: null,
    });
  }, []);

  const signTransaction = useCallback(async (xdr: string): Promise<string> => {
    const { address } = storeState;
    if (!address) throw new Error("Wallet not connected");

    let result: Awaited<ReturnType<typeof freighterSignTransaction>>;
    try {
      result = await freighterSignTransaction(xdr, {
        networkPassphrase: NETWORK_PASSPHRASE,
        address,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isUserRejection(message)) throw new UserRejectedError(message);
      throw err;
    }

    if (result.error) {
      const message = result.error.message;
      if (isUserRejection(message)) throw new UserRejectedError(message);
      throw new Error(message);
    }

    return result.signedTxXdr;
  }, []);

  useEffect(() => {
    if (!readPersistedConnection()) return;
    void (async () => {
      try {
        const connResult = await isConnected();
        if (connResult.error || !connResult.isConnected) {
          persistConnection(false);
          return;
        }

        const addressResult = await getAddress();
        if (addressResult.error || !addressResult.address) {
          persistConnection(false);
          return;
        }

        setStoreState({
          address: addressResult.address,
          connected: true,
          walletNotInstalled: false,
        });
        await refreshNetwork();
      } catch {
        persistConnection(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!snapshot.connected) return;
    const interval = setInterval(refreshNetwork, NETWORK_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [snapshot.connected]);

  const isNetworkMismatched =
    snapshot.connected &&
    snapshot.networkPassphrase !== null &&
    snapshot.networkPassphrase !== NETWORK_PASSPHRASE;

  const value = useMemo<UseWalletResult>(
    () => ({
      address: snapshot.address,
      isConnected: snapshot.connected,
      walletNotInstalled: snapshot.walletNotInstalled,
      networkPassphrase: snapshot.networkPassphrase,
      isNetworkMismatched,
      isWrongNetwork: isNetworkMismatched,
      networkName: snapshot.networkPassphrase ?? null,
      connect,
      disconnect,
      signTransaction,
    }),
    [snapshot, isNetworkMismatched, connect, disconnect, signTransaction]
  );

  if (context) return context;
  return value;
}
