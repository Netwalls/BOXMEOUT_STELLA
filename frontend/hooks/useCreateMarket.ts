"use client";
import { useState } from "react";
import { CreateMarketFormData } from "@/components/CreateMarketForm";
import { createMarketMeta } from "@/lib/api";
import { MARKET_FACTORY_CONTRACT_ID } from "@/lib/config";
import { buildSorobanInvocation, submitTransaction, decodeScVal, toU64ScVal } from "@/lib/stellar";
import { useWallet } from "@/hooks/useWallet";

export interface UseCreateMarketResult {
  createMarket: (data: CreateMarketFormData) => Promise<string>;
  isLoading: boolean;
  error: Error | null;
}

/** Converts an ISO date string to whole Unix seconds, the unit u64 timestamps use. */
function toUnixSeconds(iso: string): bigint {
  return BigInt(Math.floor(new Date(iso).getTime() / 1000));
}

/**
 * Sends the fighter metadata the contract does not store to the backend.
 * The market already exists on-chain at this point, so a failure here is logged
 * rather than reported as a failed creation.
 */
async function syncMarketMeta(txHash: string, data: CreateMarketFormData): Promise<void> {
  try {
    await createMarketMeta({ ...data, txHash });
  } catch (err) {
    console.error("Market created on-chain but metadata sync failed", err);
  }
}

/**
 * Builds and submits a create_market() transaction to the MarketFactory contract.
 * The contract takes the caller, both fighter names, the oracle and the lock and
 * end timestamps. The remaining fighter metadata is sent to the backend once the
 * transaction is confirmed.
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
    if (!MARKET_FACTORY_CONTRACT_ID) {
      throw new Error("Market factory contract is not configured");
    }

    setIsLoading(true);
    setError(null);

    try {
      const xdr = await buildSorobanInvocation({
        contractId: MARKET_FACTORY_CONTRACT_ID,
        method: "create_market",
        args: [
          address,
          data.fighterAName,
          data.fighterBName,
          data.oracleAddress,
          await toU64ScVal(toUnixSeconds(data.bettingEndsAt)),
          await toU64ScVal(toUnixSeconds(data.scheduledAt)),
        ],
        signerAddress: address,
      });

      const signedXdr = await signTransaction(xdr);
      const result = await submitTransaction(signedXdr);

      const marketId = (await decodeScVal(result.returnValue)) as string;
      await syncMarketMeta(result.txHash, data);
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
