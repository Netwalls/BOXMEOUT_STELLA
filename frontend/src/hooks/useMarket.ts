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
 * Polls every 10 seconds while market.status is "open" or "locked".
 * Stops polling when status moves to "resolved" or "cancelled".

 */
export function useMarket(market_id: string): UseMarketResult {
  const [market, setMarket] = useState<Market | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const shouldPoll = (status: Market['status']): boolean =>
      status === 'open' || status === 'locked';

    async function load() {
      try {
        const data = await fetchMarketById(market_id);
        if (cancelled) return;
        setMarket(data);
        setError(null);

        if (shouldPoll(data.status) && !intervalId) {
          intervalId = setInterval(async () => {
            try {
              const updated = await fetchMarketById(market_id);
              if (cancelled) return;
              setMarket(updated);

              if (!shouldPoll(updated.status)) {
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

  // Refresh when a claim succeeds for this market
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.marketId === market_id) {
        setMarket(null);
        setIsLoading(true);
        fetchMarketById(market_id)
          .then((m) => {
            setMarket(m);
            setError(null);
          })
          .catch((err) => setError(err as Error))
          .finally(() => setIsLoading(false));
      }
    };

    window.addEventListener('boxmeout:claim_success', handler);
    return () => window.removeEventListener('boxmeout:claim_success', handler);
  }, [market_id]);

  return { market, isLoading, error };
}
