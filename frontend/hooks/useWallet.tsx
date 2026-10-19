"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
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

// Freighter v6 resolves every call with its payload plus an optional `error`
// field rather than throwing, so each result is checked for `error` first.

const NETWORK_POLL_INTERVAL_MS = 3000;
const PERSISTED_CONNECTION_KEY = "freighter:connected";

/**
 * Thrown when the user declines to sign a transaction in Freighter.
 * Callers can `instanceof UserRejectedError` to distinguish a deliberate
 * rejection from a genuine signing failure.
 */
export class UserRejectedError extends Error {
  constructor(message = "User rejected the transaction") {
    super(message);
    this.name = "UserRejectedError";
  }
}

// Freighter reports a user decline either via an `error` payload or by
// throwing; both surface one of these messages/codes.
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
  } catch {
    // Storage may be unavailable (private mode); persistence is best-effort.
  }
}

export interface UseWalletResult {
  address: string | null;
  isConnected: boolean;
  walletNotInstalled: boolean;
  networkPassphrase: string | null;
  isNetworkMismatched: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  signTransaction: (xdr: string) => Promise<string>;
}

const WalletContext = createContext<UseWalletResult | null>(null);

/**
 * Owns the single source of truth for wallet state and the one network poll.
 * Mounted once in the root layout so every useWallet() consumer (Navbar,
 * BetForm, Portfolio, ...) reads the same state instead of polling in parallel.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>(initialState);

  const refreshNetwork = useCallback(async () => {
    try {
      const netResult = await getNetwork();
      if (netResult.error) return;
      setState((prev) => ({ ...prev, networkPassphrase: netResult.networkPassphrase }));
    } catch {
      // Leave last-known network state in place; Freighter may be transiently unreachable.
    }
  }, []);

  // Silently restores an already-authorised wallet on mount. Uses isConnected()
  // (extension presence) and getAddress() (already-granted address) which do not
  // trigger a Freighter popup, unlike requestAccess().
  const restoreConnection = useCallback(async () => {
    if (!readPersistedConnection()) return;
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

      setState((prev) => ({
        ...prev,
        address: addressResult.address,
        connected: true,
        walletNotInstalled: false,
      }));
      await refreshNetwork();
    } catch {
      // Silent restore failed; leave the wallet disconnected without surfacing an error.
    }
  }, [refreshNetwork]);

  const connect = useCallback(async () => {
    try {
      // isConnected() only reports whether the extension is installed
      const connResult = await isConnected();
      if (connResult.error || !connResult.isConnected) {
        setState((prev) => ({ ...prev, walletNotInstalled: true }));
        return;
      }

      // Prompts the user to allow this site on first use and returns the address
      const accessResult = await requestAccess();
      if (accessResult.error || !accessResult.address) {
        setState((prev) => ({ ...prev, walletNotInstalled: true }));
        return;
      }

      persistConnection(true);
      setState((prev) => ({
        ...prev,
        address: accessResult.address,
        connected: true,
        walletNotInstalled: false,
      }));
      await refreshNetwork();
    } catch {
      setState((prev) => ({ ...prev, walletNotInstalled: true }));
    }
  }, [refreshNetwork]);

  const disconnect = useCallback(() => {
    persistConnection(false);
    setState((prev) => ({ ...prev, address: null, connected: false, networkPassphrase: null }));
  }, []);

  const signTransaction = useCallback(
    async (xdr: string): Promise<string> => {
      if (!state.address) throw new Error("Wallet not connected");

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
    },
    [state.address],
  );

  // On mount, silently restore a previously-authorised wallet without prompting.
  useEffect(() => {
    void restoreConnection();
  }, [restoreConnection]);

  // Wallets can switch network at any time from their own UI; poll while
  // connected so the mismatch banner/guards react without requiring a reconnect.
  useEffect(() => {
    if (!state.connected) return;
    const interval = setInterval(refreshNetwork, NETWORK_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [state.connected, refreshNetwork]);

  const value = useMemo<UseWalletResult>(() => {
    const isNetworkMismatched =
      state.connected && state.networkPassphrase !== null && state.networkPassphrase !== NETWORK_PASSPHRASE;

    return {
      address: state.address,
      isConnected: state.connected,
      walletNotInstalled: state.walletNotInstalled,
      networkPassphrase: state.networkPassphrase,
      isNetworkMismatched,
      connect,
      disconnect,
      signTransaction,
    };
  }, [state, connect, disconnect, signTransaction]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): UseWalletResult {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
