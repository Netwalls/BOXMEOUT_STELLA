"use client";

import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import { NETWORK } from "@/lib/stellar";

// The only module that talks to Stellar Wallets Kit. The Kit's picker lists Freighter, xBull,
// Albedo, Lobstr and Hana, so the rest of the app never names a specific wallet.
// Stellar Wallets Kit v2 exposes a static API, so the Kit class itself is the shared handle.

const LAST_WALLET_KEY = "wallet:lastId";

const KIT_NETWORK =
  NETWORK === "public" || NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;

let initialised = false;

/** Returns the Kit, initialising it on first use. */
export function getWalletKit(): typeof StellarWalletsKit {
  if (!initialised) {
    StellarWalletsKit.init({
      network: KIT_NETWORK,
      selectedWalletId: readLastWalletId() ?? undefined,
      modules: defaultModules(),
    });
    initialised = true;
  }
  return StellarWalletsKit;
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
