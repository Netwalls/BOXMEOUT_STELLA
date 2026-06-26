"use client";
import { useState } from "react";
import { Bet, BetSide } from "@/lib/api";
import { buildSorobanInvocation, submitTransaction } from "@/lib/stellar";
import { useWallet } from "@/hooks/useWallet";

export interface UsePlaceBetResult {
  placeBet: (side: BetSide, amount: bigint) => Promise<Bet>;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Builds and submits the place_bet Soroban transaction for a given market.
 * Handles transaction building, fee bump, wallet signing, and submission to Stellar.
 * Returns the confirmed Bet object on success.
 */
export function usePlaceBet(market_id: string): UsePlaceBetResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { address, signTransaction } = useWallet();

  const placeBet = async (side: BetSide, amount: bigint): Promise<Bet> => {
    if (!address) {
      throw new Error("Wallet not connected");
    }

    setIsLoading(true);
    setError(null);

    try {
      const xdr = await buildSorobanInvocation({
        contractId: market_id,
        method: "place_bet",
        args: [side, amount],
        signerAddress: address,
      });

      const signedXdr = await signTransaction(xdr);
      const result = await submitTransaction(signedXdr);

      return {
        id: result.txHash,
        marketId: market_id,
        bettor: address,
        side,
        amount: amount.toString(),
        placedAt: new Date().toISOString(),
        claimed: false,
        payout: null,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { placeBet, isLoading, error };
}
