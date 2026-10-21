'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchMarketBets } from '@/lib/api';
import type { Bet } from '@/lib/api';

export interface UseMarketBetsResult {
  /** Bets for the market, sorted most-recent-first by `placedAt`. */
  bets: Bet[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * #1116 — useMarketBets
 *
 * Fetches all bets for a given market and returns them sorted most-recent-first
 * so the activity feed always shows the latest action at the top.
 *
 * @param market_id  The market whose bets should be fetched.
 */
export function useMarketBets(market_id: string): UseMarketBetsResult {
  const [bets, setBets] = useState<Bet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const doFetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchMarketBets(market_id);
      // Sort descending by placedAt so the most-recent bet appears first.
      const sorted = [...data].sort(
        (a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime(),
      );
      setBets(sorted);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [market_id]);

  const refetch = useCallback(() => {
    doFetch();
  }, [doFetch]);

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  return { bets, isLoading, error, refetch };
}
