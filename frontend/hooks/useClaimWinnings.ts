"use client";
import { useState } from "react";
import { ClaimReceipt } from "@/components/ClaimButton";
import { buildSorobanInvocation, submitTransaction, decodeScVal } from "@/lib/stellar";
import { fetchMarketById, fetchMarketBets } from "@/lib/api";
import { useWallet } from "@/hooks/useWallet";

export interface ClaimReceipt {
  betId: string;
  bettor: string;
  payout: bigint;
  claimedAt: string;
}

export interface UseClaimWinningsResult {
  claim: (bet_id: string, market_id: string) => Promise<ClaimReceipt>;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Detects whether to call claim_winnings() or claim_refund() based on market outcome.
 * Builds and submits the correct Soroban transaction via the connected wallet.
 * Returns a ClaimReceipt with the final payout amount on success.
 */
export function useClaimWinnings(): UseClaimWinningsResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { address, signTransaction } = useWallet();

  const claim = async (bet_id: string, market_id: string): Promise<ClaimReceipt> => {
    if (!address) {
      throw new Error("Wallet not connected");
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch market and bet details
      const market = await fetchMarketById(market_id);
      const bets = await fetchMarketBets(market_id);
      const bet = bets.find((b) => b.id === bet_id);

      if (!bet) {
        throw new Error("Bet not found");
      }

      // Determine which method to call
      let method: string;
      if (market.status === "Cancelled") {
        method = "claim_refund";
      } else if (market.status === "Resolved") {
        method = "claim_winnings";
      } else {
        throw new Error("Market is not in a claimable state");
      }

      // Build and submit transaction
      const xdr = await buildSorobanInvocation({
        contractId: market_id,
        method,
        args: [bet_id],
        signerAddress: address,
      });

      const signedXdr = await signTransaction(xdr);
      const result = await submitTransaction(signedXdr);

      // Decode payout from return value
      const payout = decodeScVal(result.returnValue) as bigint;

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

  return { claim, isLoading, error };
}
