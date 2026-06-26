"use client";
import { useState } from "react";
import { CreateMarketFormData } from "@/components/CreateMarketForm";
import { buildSorobanInvocation, submitTransaction, decodeScVal } from "@/lib/stellar";
import { useWallet } from "@/hooks/useWallet";

export interface UseCreateMarketResult {
  createMarket: (data: CreateMarketFormData) => Promise<string>;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Builds and submits a create_market() transaction to the MarketFactory contract.
 * Signs via the connected wallet and waits for ledger confirmation.
 * Returns the new market_id (hex string) on success.
 */
export function useCreateMarket(): UseCreateMarketResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { address, signTransaction } = useWallet();

  const createMarket = async (data: CreateMarketFormData): Promise<string> => {
    if (!address) {
      throw new Error("Wallet not connected");
    }

    setIsLoading(true);
    setError(null);

    try {
      const xdr = await buildSorobanInvocation({
        contractId: "MARKET_FACTORY_ID",
        method: "create_market",
        args: [
          data.fighterAName,
          data.fighterARecord,
          data.fighterANationality,
          data.fighterAWeightClass,
          data.fighterBName,
          data.fighterBRecord,
          data.fighterBNationality,
          data.fighterBWeightClass,
          new Date(data.scheduledAt).getTime() / 1000,
          new Date(data.bettingEndsAt).getTime() / 1000,
          data.oracleAddress,
        ],
        signerAddress: address,
      });

      const signedXdr = await signTransaction(xdr);
      const result = await submitTransaction(signedXdr);
      
      const marketId = decodeScVal(result.returnValue) as string;
      return marketId;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { createMarket, isLoading, error };
}
