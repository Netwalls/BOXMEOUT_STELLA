"use client";
import { useState, useEffect, useRef } from "react";
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
  const controllerRef = useRef<AbortController | null>(null);

  const fetchData = async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    if (!address) {
      setBets([]);
      setSummary(null);
      return;
    }

    setIsLoading(true);
    try {
      const [betsData, summaryData] = await Promise.all([
        fetchBetsByAddress(address, controller.signal),
        fetchPortfolioSummary(address, controller.signal),
      ]);
      if (controller.signal.aborted) return;
      setBets(betsData);
      setSummary(summaryData);
    } catch (error) {
      // An aborted request was superseded or unmounted; stay silent.
      if (controller.signal.aborted) return;
      // Handle partial failure gracefully
      if (error instanceof Error) {
        console.error("Failed to fetch portfolio data:", error.message);
      }
      reportError(error, { source: "usePortfolio", operation: "fetchPortfolio" });
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    return () => {
      controllerRef.current?.abort();
    };
  }, [address]);

  return {
    bets,
    summary,
    isLoading,
    refetch: fetchData,
  };
}
