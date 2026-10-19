"use client";
import { useState } from "react";
import { CreateMarketFormData } from "@/components/CreateMarketForm";
import { buildSorobanInvocation, submitTransaction, decodeScVal } from "@/lib/stellar";
import { useWallet } from "@/hooks/useWallet";
import {
  createMarketMeta,
  fetchMarketById,
  type CreateMarketMetaInput,
} from "@/lib/api";

export interface UseCreateMarketResult {
  createMarket: (data: CreateMarketFormData) => Promise<string>;
  isLoading: boolean;
  /** True once the transaction is confirmed and we are polling for the indexed market. */
  isWaitingForIndexer: boolean;
  error: Error | null;
}

// Metadata submission and indexer polling both retry with exponential backoff.
export const METADATA_MAX_ATTEMPTS = 3;
export const INDEXER_MAX_ATTEMPTS = 10;
export const RETRY_BASE_DELAY_MS = 1000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const backoff = (attempt: number) => RETRY_BASE_DELAY_MS * 2 ** attempt;

/** Runs `task` until it resolves, sleeping with backoff between failed attempts. */
async function withRetry<T>(task: () => Promise<T>, maxAttempts: number): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await task();
    } catch (err) {
      if (attempt + 1 >= maxAttempts) throw err;
      await wait(backoff(attempt));
    }
  }
}

/**
 * Sends the tx hash and fighter details to the backend, then polls until the
 * indexer exposes the market. Resolves only once the market page can load it.
 */
async function reconcileMarket(
  marketId: string,
  meta: CreateMarketMetaInput,
  onWaitingForIndexer: () => void,
): Promise<string> {
  await withRetry(() => createMarketMeta(meta), METADATA_MAX_ATTEMPTS);

  onWaitingForIndexer();
  await withRetry(() => fetchMarketById(marketId), INDEXER_MAX_ATTEMPTS);
  return marketId;
}

/**
 * Builds and submits a create_market() transaction to the MarketFactory contract.
 * Signs via the connected wallet, waits for ledger confirmation, then reconciles
 * the market with the backend. Returns the market_id once it is available.
 */
export function useCreateMarket(): UseCreateMarketResult {
  const [isLoading, setIsLoading] = useState(false);
  const [isWaitingForIndexer, setIsWaitingForIndexer] = useState(false);
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
    setIsWaitingForIndexer(false);
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
      
      const marketId = (await decodeScVal(result.returnValue)) as string;
      return await reconcileMarket(
        marketId,
        {
          txHash: result.txHash,
          fighterAName: data.fighterAName,
          fighterARecord: data.fighterARecord,
          fighterANationality: data.fighterANationality,
          fighterAWeightClass: data.fighterAWeightClass,
          fighterBName: data.fighterBName,
          fighterBRecord: data.fighterBRecord,
          fighterBNationality: data.fighterBNationality,
          fighterBWeightClass: data.fighterBWeightClass,
          scheduledAt: data.scheduledAt,
          bettingEndsAt: data.bettingEndsAt,
          oracleAddress: data.oracleAddress,
        },
        () => setIsWaitingForIndexer(true),
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
      setIsWaitingForIndexer(false);
    }
  };

  return { createMarket, isLoading, isWaitingForIndexer, error };
}
