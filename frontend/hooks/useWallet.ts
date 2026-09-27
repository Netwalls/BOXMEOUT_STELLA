"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  isConnected,
  requestAccess,
  getNetwork,
  signTransaction as freighterSignTransaction,
} from "@stellar/freighter-api";
import { NETWORK_PASSPHRASE } from "@/lib/stellar";

// Freighter v6 resolves every call with its payload plus an optional `error`
// field rather than throwing, so each result is checked for `error` first.

const NETWORK_POLL_INTERVAL_MS = 3000;

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

      setState({ address: accessResult.address, connected: true, walletNotInstalled: false });
      await refreshNetwork();
    } catch {
      setState({ walletNotInstalled: true });
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({ address: null, connected: false, networkPassphrase: null });
  }, []);

  const signTransaction = useCallback(async (xdr: string): Promise<string> => {
    const { address } = state;
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
