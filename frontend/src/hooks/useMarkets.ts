// ============================================================
// BOXMEOUT — useMarkets Hook
// Fetches and auto-refreshes the full market list.
// Contributors: implement the hook body.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import type { Market } from '../types';
import type { MarketFilters, PaginationParams } from '../services/api';
import { fetchMarkets } from '../services/api';

const POLL_INTERVAL = 30_000;

export interface UseMarketsResult {
  markets: Market[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  /** Call to trigger a manual refetch */
  refetch: () => void;
}

/**
 * Fetches all boxing markets from the API.
 * Auto-polls every 30 seconds to pick up new markets and status changes.
 * Polling stops when the component using this hook unmounts.
 *
 * Returns stale data during a background refresh (isLoading stays false
 * to avoid layout flash — use a subtle spinner instead).
 */
export function useMarkets(filters?: MarketFilters, pagination?: PaginationParams): UseMarketsResult {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const fetchAndUpdate = useCallback(async () => {
    try {
      const response = await fetchMarkets(filters, pagination);
      setMarkets(response.markets);
      setTotal(response.total);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, [filters, pagination]);

  // Reset interval and trigger immediate fetch
  const refetch = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    fetchAndUpdate();
    const id = setInterval(fetchAndUpdate, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchAndUpdate, tick]);

  return { markets, total, isLoading, error, refetch };
}
