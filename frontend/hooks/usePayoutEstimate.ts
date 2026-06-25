"use client";
import { useState, useEffect, useRef } from "react";
import { BetSide, fetchPayoutEstimate } from "@/lib/api";

export interface UsePayoutEstimateResult {
  estimate: bigint | null;
  isLoading: boolean;
}

/**
 * Debounced hook (300ms) that calls the payout estimate API whenever
 * side or amount changes. Returns null while inputs are invalid or loading.
 * Used to show live payout previews in BetAmountInput.
 */
export function usePayoutEstimate(
  market_id: string,
  side: BetSide | null,
  amount: bigint | null
): UsePayoutEstimateResult {
  const [estimate, setEstimate] = useState<bigint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Return early if inputs are invalid
    if (!side || !amount || amount === 0n) {
      setEstimate(null);
      setIsLoading(false);
      return;
    }

    // Set debounce timeout
    setIsLoading(true);
    timeoutRef.current = setTimeout(async () => {
      try {
        const result = await fetchPayoutEstimate(market_id, side, amount);
        setEstimate(result);
      } catch (error) {
        setEstimate(null);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [market_id, side, amount]);

  return { estimate, isLoading };
}
