"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
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

// Module-level store shared by every useWallet() call site, so the connected
// wallet's address/network stays consistent across the navbar, the
// network-mismatch banner, and the mutation hooks without needing a Context
// provider wired through the whole tree.
let state: WalletState = { ...initialState };
const listeners = new Set<() => void>();

function setState(patch: Partial<WalletState>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): WalletState {
  return state;
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
  } catch {
    // Storage may be unavailable (private mode); persistence is best-effort.
  }
}

/** Test-only: resets the shared wallet store between test cases. */
export function __resetWalletStoreForTests(): void {
  state = { ...initialState };
}

async function refreshNetwork(): Promise<void> {
  try {
    const netResult = await getNetwork();
    if (netResult.error) return;
    setState({ networkPassphrase: netResult.networkPassphrase });
  } catch {
    // Leave last-known network state in place; Freighter may be transiently unreachable.
  }
}

// Silently restores an already-authorised wallet on mount. Uses isConnected()
// (extension presence) and getAddress() (already-granted address) which do not
// trigger a Freighter popup, unlike requestAccess().
async function restoreConnection(): Promise<void> {
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

    setState({ address: addressResult.address, connected: true, walletNotInstalled: false });
    await refreshNetwork();
  } catch {
    // Silent restore failed; leave the wallet disconnected without surfacing an error.
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

export function useWallet(): UseWalletResult {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const connect = useCallback(async () => {
    try {
      // isConnected() only reports whether the extension is installed
      const connResult = await isConnected();
      if (connResult.error || !connResult.isConnected) {
        setState({ walletNotInstalled: true });
        return;
      }

      // Prompts the user to allow this site on first use and returns the address
      const accessResult = await requestAccess();
      if (accessResult.error || !accessResult.address) {
        setState({ walletNotInstalled: true });
        return;
      }

      persistConnection(true);
      setState({ address: accessResult.address, connected: true, walletNotInstalled: false });
      await refreshNetwork();
    } catch {
      setState({ walletNotInstalled: true });
    }
  }, []);

  const disconnect = useCallback(() => {
    persistConnection(false);
    setState({ address: null, connected: false, networkPassphrase: null });
  }, []);

  const signTransaction = useCallback(async (xdr: string): Promise<string> => {
    const { address } = state;
    if (!address) throw new Error("Wallet not connected");

    const result = await freighterSignTransaction(xdr, {
      networkPassphrase: NETWORK_PASSPHRASE,
      address,
    });
    if (result.error) throw new Error(result.error.message);

    return result.signedTxXdr;
  }, []);

  // On mount, silently restore a previously-authorised wallet without prompting.
  useEffect(() => {
    void restoreConnection();
  }, []);

  // Wallets can switch network at any time from their own UI; poll while
  // connected so the mismatch banner/guards react without requiring a reconnect.
  useEffect(() => {
    if (!snapshot.connected) return;
    const interval = setInterval(refreshNetwork, NETWORK_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [snapshot.connected]);

  const isNetworkMismatched =
    snapshot.connected && snapshot.networkPassphrase !== null && snapshot.networkPassphrase !== NETWORK_PASSPHRASE;

  return {
    address: snapshot.address,
    isConnected: snapshot.connected,
    walletNotInstalled: snapshot.walletNotInstalled,
    networkPassphrase: snapshot.networkPassphrase,
    isNetworkMismatched,
    connect,
    disconnect,
    signTransaction,
  };
}
