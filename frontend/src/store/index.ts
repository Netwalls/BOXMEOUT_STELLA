// ============================================================
// BOXMEOUT — Global Zustand Store
// Holds app-wide state: wallet, network, notifications.
// Contributors: implement the store slices.
// ============================================================

import { create } from 'zustand';
import type { TxStatus } from '../types';

export type Network = 'testnet' | 'mainnet';

interface AppState {
  // ── Wallet ────────────────────────────────────────────────
  walletAddress: string | null;
  walletBalance: number | null;
  isConnecting: boolean;

  // ── Network ───────────────────────────────────────────────
  network: Network;

  // ── Last transaction ──────────────────────────────────────
  lastTxStatus: TxStatus;

  // ── Actions ───────────────────────────────────────────────
  /** Set connected wallet address and balance */
  setWallet: (address: string, balance: number) => void;
  /** Clear wallet state on disconnect */
  clearWallet: () => void;
  /** Toggle between testnet and mainnet */
  setNetwork: (network: Network) => void;
  /** Update last transaction status for TxStatusToast */
  setTxStatus: (status: TxStatus) => void;
}

export const useAppStore = create<AppState>((set) => ({
  walletAddress: null,
  walletBalance: null,
  isConnecting: false,
  network: (process.env.NEXT_PUBLIC_STELLAR_NETWORK as Network) ?? 'testnet',
  lastTxStatus: { hash: null, status: 'idle', error: null },

  setWallet: (address, balance) => set({ walletAddress: address, walletBalance: balance }),
  clearWallet: () => set({ walletAddress: null, walletBalance: null }),
  setNetwork: (network) => set({ network }),
  setTxStatus: (status) => set({ lastTxStatus: status }),
}));
