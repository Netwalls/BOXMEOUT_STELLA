'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMarkets } from '@/lib/api';
import type { Market, MarketFilters } from '@/lib/api';
import { useVisibilityInterval } from './useVisibilityInterval';

export type { MarketFilters };

export interface UseMarketsOptions {
  /**
   * How often (in milliseconds) to re-fetch the market list for live-odds
   * updates. Defaults to 30 000 ms (30 s).
   */
  pollingInterval?: number;
}

export interface UseMarketsResult {
  markets: Market[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * #1114 — useMarkets
 *
 * Fetches and caches the market list, then polls on a configurable interval so
 * the odds stay live. Polling is automatically paused while the browser tab is
 * hidden (Page Visibility API) to avoid unnecessary network traffic when the
 * user isn't looking at the page.
 *
 * @param filters   Optional status / weight-class filters forwarded to the API.
 * @param options   Hook options — currently `pollingInterval` (default 30 s).
 */
export function useMarkets(
  filters?: MarketFilters,
  { pollingInterval = 30_000 }: UseMarketsOptions = {},
): UseMarketsResult {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Keep a ref so the interval callback always sees the latest `filters`
  // without re-registering the interval on every filter change.
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  });

  const doFetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchMarkets(filtersRef.current);
      setMarkets(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, []); // stable: no deps, reads filters via ref

  // Expose a stable refetch handle that callers can trigger manually.
  const refetch = useCallback(() => {
    doFetch();
  }, [doFetch]);

  // Initial fetch whenever filters change.
  useEffect(() => {
    doFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Poll for live odds, paused while the tab is hidden.
  useVisibilityInterval(doFetch, pollingInterval);

  return { markets, isLoading, error, refetch };
}
