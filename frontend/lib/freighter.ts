// ============================================================
// BOXMEOUT — Freighter Wallet Utilities (lib)
// Low-level helpers for Freighter browser extension integration.
// Works on Stellar Testnet and Mainnet (from NEXT_PUBLIC_STELLAR_NETWORK).
// ============================================================

import { Networks } from '@stellar/stellar-sdk';

const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';

export const NETWORK_PASSPHRASE =
  NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

// ─── Error ────────────────────────────────────────────────────────────────────

export class FreighterNotInstalledError extends Error {
  constructor() {
    super('Freighter is not installed. Get it at https://freighter.app');
    this.name = 'FreighterNotInstalledError';
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getFreighter(): any {
  if (typeof window === 'undefined') return null;
  return (window as any).freighter ?? null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if the Freighter extension is present in the browser.
 * Safe to call server-side (returns false).
 */
export function isFreighterAvailable(): boolean {
  return getFreighter() !== null;
}

/**
 * Requests wallet access and returns the user's public key.
 * Throws FreighterNotInstalledError if the extension is not present.
 * Throws if the user rejects the connection request.
 */
export async function connectFreighter(): Promise<string> {
  const freighter = getFreighter();
  if (!freighter) throw new FreighterNotInstalledError();

  await freighter.requestAccess();
  const { publicKey } = await freighter.getPublicKey();
  return publicKey;
}

/**
 * Signs a transaction XDR string with Freighter and returns the signed XDR.
 * Throws FreighterNotInstalledError if the extension is not present.
 * Throws if the user rejects signing.
 *
 * @param xdr - Base64-encoded transaction XDR to sign
 * @returns Signed transaction XDR string
 */
export async function signTransaction(xdr: string): Promise<string> {
  const freighter = getFreighter();
  if (!freighter) throw new FreighterNotInstalledError();

  const result = await freighter.signTransaction(xdr, {
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  // Freighter v2+ returns { signedTxXdr }, older versions return the string directly
  return typeof result === 'string' ? result : result.signedTxXdr;
}
