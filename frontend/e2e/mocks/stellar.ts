// Swapped in for @/lib/stellar in E2E builds (see next.config.js). Keeps the
// real constants and helpers but skips Soroban RPC, whose XDR responses can't be
// faked reliably in the browser. Signing still goes through window.freighterApi.
import type { SorobanInvokeParams, TransactionResult } from "../../lib/stellar";

export * from "../../lib/stellar";

export const E2E_TX_HASH = "e2e0000000000000000000000000000000000000000000000000000000000001";
export const E2E_CLAIM_PAYOUT = BigInt(250_000_000);

export async function buildSorobanInvocation(params: SorobanInvokeParams): Promise<string> {
  return `E2E_UNSIGNED:${params.method}`;
}

// create_market returns the new market's id; every other call returns a payout
export const E2E_CREATED_MARKET_ID = "e2e-created";

export async function submitTransaction(signedXdr: string): Promise<TransactionResult> {
  const returnValue = signedXdr.includes("create_market") ? E2E_CREATED_MARKET_ID : E2E_CLAIM_PAYOUT;
  return { txHash: E2E_TX_HASH, ledger: 1, returnValue };
}

export async function decodeScVal(scVal: unknown): Promise<unknown> {
  return scVal;
}
