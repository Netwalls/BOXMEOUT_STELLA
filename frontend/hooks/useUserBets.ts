"use client";

import { useCallback, useEffect, useState } from "react";
import { Bet, fetchUserBets } from "@/lib/api";

export const USER_BETS_PAGE_SIZE = 20;

export interface UseUserBetsResult {
  bets: Bet[];
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
}

/**
 * Bet history for a wallet, newest first, loaded one page at a time. `loadMore` fetches the
 * next page and appends it. Switching address starts again from the first page.
 */
export function useUserBets(address: string | null): UseUserBetsResult {
  // The page is tagged with its address, so a page from the previous wallet is never used.
  const [pageState, setPageState] = useState<{ address: string | null; page: number }>({
    address,
    page: 1,
  });
  const page = pageState.address === address ? pageState.page : 1;

  const [loaded, setLoaded] = useState<{ address: string | null; bets: Bet[]; hasMore: boolean }>({
    address: null,
    bets: [],
    hasMore: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // Bumped by retry() so the current page is fetched again after a failure.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!address) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchUserBets(address, page, USER_BETS_PAGE_SIZE)
      .then((data) => {
        if (cancelled) return;
        setLoaded((prev) => ({
          address,
          bets: page === 1 || prev.address !== address ? data : [...prev.bets, ...data],
          hasMore: data.length === USER_BETS_PAGE_SIZE,
        }));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error("Unknown error"));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address, page, attempt]);

  const loadMore = useCallback(() => {
    if (isLoading || !loaded.hasMore) return;
    setPageState({ address, page: page + 1 });
  }, [address, isLoading, loaded.hasMore, page]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const current = loaded.address === address;

  return {
    bets: current ? loaded.bets : [],
    isLoading,
    error,
    hasMore: current && loaded.hasMore,
    loadMore,
    retry,
  };
}
