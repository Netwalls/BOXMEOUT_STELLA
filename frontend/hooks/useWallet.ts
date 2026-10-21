"use client";

import {
  createElement,
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { NETWORK_PASSPHRASE } from "@/lib/stellar";
import { getWalletKit, persistLastWalletId, readLastWalletId } from "@/lib/walletKit";

const NETWORK_POLL_INTERVAL_MS = 3000;

/**
 * Thrown when the user declines to sign in their wallet.
 * Callers can `instanceof UserRejectedError` to distinguish a deliberate
 * rejection from a genuine signing failure.
 */
export class UserRejectedError extends Error {
  constructor(message = "User rejected the transaction") {
    super(message);
    this.name = "UserRejectedError";
  }
}

// Wallets report a user decline with one of these messages, whichever wallet the user picked.
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

export interface UseWalletResult {
  address: string | null;
  isConnected: boolean;
  walletNotInstalled: boolean;
  networkPassphrase: string | null;
  isNetworkMismatched: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  signTransaction: (xdr: string) => Promise<string>;
  signMessage: (message: string) => Promise<string>;
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
      const { networkPassphrase } = await getWalletKit().getNetwork();
      setState((prev) => ({ ...prev, networkPassphrase }));
    } catch {
      // Leave last-known network state in place; the wallet may be briefly unreachable.
    }
  }, []);

  // Restores the last-used wallet on mount without showing the picker. Asking for the
  // address of a wallet the user already connected does not prompt them again.
  const restoreConnection = useCallback(async () => {
    const lastWalletId = readLastWalletId();
    if (!lastWalletId) return;
    try {
      const wallets = getWalletKit();
      wallets.setWallet(lastWalletId);
      const { address } = await wallets.getAddress();
      if (!address) {
        persistLastWalletId(null);
        return;
      }

      setState((prev) => ({ ...prev, address, connected: true, walletNotInstalled: false }));
      await refreshNetwork();
    } catch {
      // Silent restore failed; leave the wallet disconnected without surfacing an error.
    }
  }, [refreshNetwork]);

  // Opens the Kit's picker. The wallet the user chooses is remembered for the next visit.
  const connect = useCallback(async () => {
    getWalletKit().openModal({
      onWalletSelected: async (option) => {
        try {
          const wallets = getWalletKit();
          wallets.setWallet(option.id);
          const { address } = await wallets.getAddress();
          persistLastWalletId(option.id);
          setState((prev) => ({ ...prev, address, connected: true, walletNotInstalled: false }));
          await refreshNetwork();
        } catch {
          setState((prev) => ({ ...prev, walletNotInstalled: true }));
        }
      },
    });
  }, [refreshNetwork]);

  const disconnect = useCallback(() => {
    persistLastWalletId(null);
    try {
      getWalletKit().disconnect();
    } catch {
      // Clearing local state below is enough for the app even if the wallet refuses.
    }
    setState((prev) => ({ ...prev, address: null, connected: false, networkPassphrase: null }));
  }, []);

  const signTransaction = useCallback(
    async (xdr: string): Promise<string> => {
      if (!state.address) throw new Error("Wallet not connected");
      try {
        const result = await getWalletKit().signTransaction(xdr, {
          networkPassphrase: NETWORK_PASSPHRASE,
          address: state.address,
        });
        return result.signedTxXdr;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isUserRejection(message)) throw new UserRejectedError(message);
        throw err;
      }
    },
    [state.address],
  );

    let result: Awaited<ReturnType<typeof freighterSignTransaction>>;
    try {
      result = await freighterSignTransaction(xdr, {
        networkPassphrase: NETWORK_PASSPHRASE,
        address: state.address,
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
      signMessage,
    };
  }, [state, connect, disconnect, signTransaction, signMessage]);

  return createElement(WalletContext.Provider, { value }, children);
}

export function useWallet(): UseWalletResult {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
