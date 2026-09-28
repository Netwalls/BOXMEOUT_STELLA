"use client";
import { useState } from "react";
import type { ClaimReceipt } from "@/components/ClaimButton";
import { buildSorobanInvocation, submitTransaction, decodeScVal } from "@/lib/stellar";
import { fetchMarketById, fetchMarketBets } from "@/lib/api";
import { useWallet } from "@/hooks/useWallet";

export interface UseClaimRefundResult {
  claimRefund: (bet_id: string, market_id: string) => Promise<ClaimReceipt>;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Calls claim_refund() on a Cancelled or NoContest market via the connected wallet.
 * Builds and submits the Soroban transaction, returning a ClaimReceipt on success.
 */
export function useClaimRefund(): UseClaimRefundResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { address, signTransaction, isNetworkMismatched } = useWallet();

  const claimRefund = async (bet_id: string, market_id: string): Promise<ClaimReceipt> => {
    if (!address) {
      throw new Error("Wallet not connected");
    }
    if (isNetworkMismatched) {
      throw new Error("Wallet is connected to the wrong network");
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch market and bet details to validate state
      const market = await fetchMarketById(market_id);
      const bets = await fetchMarketBets(market_id);
      const bet = bets.find((b) => b.id === bet_id);

      if (!bet) {
        throw new Error("Bet not found");
      }

      if (market.status !== "Cancelled" && market.outcome !== "NoContest") {
        throw new Error("Market is not in a refundable state");
      }

      // Build and submit claim_refund transaction
      const xdr = await buildSorobanInvocation({
        contractId: market_id,
        method: "claim_refund",
        args: [bet_id],
        signerAddress: address,
      });

      const signedXdr = await signTransaction(xdr);
      const result = await submitTransaction(signedXdr);

      // Decode refunded amount from return value
      const payout = (await decodeScVal(result.returnValue)) as bigint;

      return {
        betId: bet_id,
        bettor: address,
        payout,
        claimedAt: new Date().toISOString(),
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { claimRefund, isLoading, error };
}
