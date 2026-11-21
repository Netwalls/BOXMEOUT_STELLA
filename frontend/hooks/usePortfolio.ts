"use client";
import { useState, useEffect } from "react";
import { Bet, PortfolioSummary, fetchBetsByAddress, fetchPortfolioSummary } from "@/lib/api";
import { reportError } from "@/lib/telemetry";

export interface UsePortfolioResult {
  bets: Bet[];
  summary: PortfolioSummary | null;
  isLoading: boolean;
  refetch: () => void;
}

/**
 * Fetches all bets and portfolio summary for the given Stellar address.
 * Returns empty bets and null summary when address is null (wallet not connected).
 * Does not activate any network requests until address is non-null.
 */
export function usePortfolio(address: string | null): UsePortfolioResult {
  const [bets, setBets] = useState<Bet[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchData = async () => {
    if (!address) {
      setBets([]);
      setSummary(null);
      return;
    }

    setIsLoading(true);
    try {
      const [betsData, summaryData] = await Promise.all([
        fetchBetsByAddress(address),
        fetchPortfolioSummary(address),
      ]);
      setBets(betsData);
      setSummary(summaryData);
    } catch (error) {
      // Handle partial failure gracefully
      if (error instanceof Error) {
        console.error("Failed to fetch portfolio data:", error.message);
      }
      reportError(error, { source: "usePortfolio", operation: "fetchPortfolio" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [address]);

  return {
    bets,
    summary,
    isLoading,
    refetch: fetchData,
  };
}
