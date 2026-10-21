"use client";
import { useState } from "react";
import { CreateMarketFormData } from "@/components/CreateMarketForm";
import {
  buildSorobanInvocation,
  submitTransaction,
  decodeScVal,
  str,
  u64,
  address,
} from "@/lib/stellar";
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
  const { address, signTransaction, isNetworkMismatched } = useWallet();

  const createMarket = async (data: CreateMarketFormData): Promise<string> => {
    if (!address) {
      throw new Error("Wallet not connected");
    }
    if (isNetworkMismatched) {
      throw new Error("Wallet is connected to the wrong network");
    }

    setIsLoading(true);
    setError(null);

    try {
      const xdr = await buildSorobanInvocation({
        contractId: "MARKET_FACTORY_ID",
        method: "create_market",
        args: await Promise.all([
          str(data.fighterAName),
          str(data.fighterARecord),
          str(data.fighterANationality),
          str(data.fighterAWeightClass),
          str(data.fighterBName),
          str(data.fighterBRecord),
          str(data.fighterBNationality),
          str(data.fighterBWeightClass),
          u64(BigInt(Math.floor(new Date(data.scheduledAt).getTime() / 1000))),
          u64(BigInt(Math.floor(new Date(data.bettingEndsAt).getTime() / 1000))),
          address(data.oracleAddress),
        ]),
        signerAddress: address,
      });

      const signedXdr = await signTransaction(xdr);
      const result = await submitTransaction(signedXdr);
      
      const marketId = (await decodeScVal(result.returnValue)) as string;
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
