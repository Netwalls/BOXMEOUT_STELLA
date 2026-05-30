// ============================================================
// BOXMEOUT — useMarketOdds Hook
// Auto-refreshing odds hook backed by TanStack Query.
// Refetches every 5 seconds; stops when market is Resolved or Cancelled.
// ============================================================

import { useQuery } from '@tanstack/react-query';
import { fetchOdds, type MarketOdds } from '../../lib/api';
import type { MarketStatus } from '../types';

const REFETCH_INTERVAL_MS = 5_000;

/** Statuses where live odds are no longer meaningful */
const TERMINAL_STATUSES: MarketStatus[] = ['resolved', 'cancelled'];

export interface UseMarketOddsResult {
  odds: MarketOdds | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Fetches and auto-refreshes odds for a market.
 *
 * @param marketId - The market to watch
 * @param status   - Current market status (stops polling when resolved/cancelled)
 */
export function useMarketOdds(
  marketId: string,
  status?: MarketStatus,
): UseMarketOddsResult {
  const isTerminal = status != null && TERMINAL_STATUSES.includes(status);

  const { data, isLoading, error } = useQuery<MarketOdds, Error>({
    queryKey: ['odds', marketId],
    queryFn: () => fetchOdds(marketId),
    refetchInterval: isTerminal ? false : REFETCH_INTERVAL_MS,
    enabled: Boolean(marketId),
  });

  return {
    odds: data ?? null,
    isLoading,
    error: error ?? null,
  };
}
