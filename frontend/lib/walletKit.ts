"use client";

import { StellarWalletsKit, WalletNetwork, allowAllModules } from "@creit.tech/stellar-wallets-kit";
import { NETWORK } from "@/lib/stellar";

// The only module that talks to Stellar Wallets Kit. The Kit's picker lists Freighter, xBull,
// Albedo, Lobstr and Hana, so the rest of the app never names a specific wallet.

const LAST_WALLET_KEY = "wallet:lastId";

const KIT_NETWORK =
  NETWORK === "public" || NETWORK === "mainnet" ? WalletNetwork.PUBLIC : WalletNetwork.TESTNET;

let kit: StellarWalletsKit | null = null;

/** Returns the shared Kit instance, created on first use. */
export function getWalletKit(): StellarWalletsKit {
  if (!kit) {
    kit = new StellarWalletsKit({
      network: KIT_NETWORK,
      selectedWalletId: readLastWalletId() ?? undefined,
      modules: allowAllModules(),
    });
  }
  return kit;
}

/** The wallet the user last connected with, so it can be restored without the picker. */
export function readLastWalletId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_WALLET_KEY);
  } catch {
    return null;
  }
}

export function persistLastWalletId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) {
      window.localStorage.setItem(LAST_WALLET_KEY, id);
    } else {
      window.localStorage.removeItem(LAST_WALLET_KEY);
    }
  } catch {
    // Storage may be unavailable (private mode); remembering the wallet is best-effort.
  }
}
