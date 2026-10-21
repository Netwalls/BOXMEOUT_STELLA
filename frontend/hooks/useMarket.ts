'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMarketById } from '@/lib/api';
import type { Market } from '@/lib/api';

export interface UseMarketResult {
  /** The fetched market, or `null` while loading / when not found. */
  market: Market | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * #1115 — useMarket
 *
 * Fetches a single market by ID and polls every 10 seconds so live odds stay
 * current. The `market` field is guaranteed to be `null` while the initial
 * request is in flight — it is never set to a stale object or an empty
 * placeholder, preventing consumers from rendering with partial data.
 *
 * @param market_id  The market identifier to fetch.
 */
export function useMarket(market_id: string): UseMarketResult {
  // Explicitly start as null — not an empty object.
  const [market, setMarket] = useState<Market | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Stable ref so the interval callback always reads the current id.
  const idRef = useRef(market_id);
  useEffect(() => {
    idRef.current = market_id;
  });

  const doFetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchMarketById(idRef.current);
      setMarket(data);
    } catch (err) {
      // On any error (including 404) reset market to null and surface the error.
      setMarket(null);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, []); // stable: reads id via ref

  const refetch = useCallback(() => {
    doFetch();
  }, [doFetch]);

  useEffect(() => {
    // Reset to loading state whenever the id changes so consumers never see
    // the previous market while the new one is still loading.
    setMarket(null);
    setIsLoading(true);
    setError(null);

    doFetch();

    const id = setInterval(() => {
      doFetch();
    }, 10_000);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market_id]);

  return { market, isLoading, error, refetch };
}
