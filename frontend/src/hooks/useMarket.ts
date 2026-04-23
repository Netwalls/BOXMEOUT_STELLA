// ============================================================
// BOXMEOUT — useMarket Hook
// ============================================================

import { useState, useEffect } from 'react';
import type { Market } from '../types';
import { fetchMarketById } from '../services/api';

export interface UseMarketResult {
  market: Market | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Fetches a single market's full detail by market_id.
 * Polls every 10 seconds while market.status === "open" to keep odds live.
 * Stops polling when status moves to locked/resolved/cancelled.
 */
export function useMarket(market_id: string): UseMarketResult {
  const [market, setMarket] = useState<Market | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchMarketById(market_id);
        if (cancelled) return;
        setMarket(data);
        setError(null);

        if (data.status === 'open' && !intervalId) {
          intervalId = setInterval(async () => {
            try {
              const updated = await fetchMarketById(market_id);
              if (cancelled) return;
              setMarket(updated);
              if (updated.status !== 'open') {
                clearInterval(intervalId!);
                intervalId = null;
              }
            } catch (e) {
              if (!cancelled) setError(e as Error);
            }
          }, 10_000);
        }
      } catch (e) {
        if (!cancelled) setError(e as Error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [market_id]);

  return { market, isLoading, error };
}
