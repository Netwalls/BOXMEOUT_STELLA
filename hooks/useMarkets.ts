import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { apiFetch } from '../lib/api';
import type { Market, MarketStatus } from '../types/market';

export type MarketSort = 'fight_date' | 'pool_size' | 'newest';

export const MARKET_SORT_OPTIONS: { value: MarketSort; label: string }[] = [
  { value: 'fight_date', label: 'Fight date' },
  { value: 'pool_size', label: 'Pool size' },
  { value: 'newest', label: 'Newest' },
];

export const DEFAULT_MARKET_SORT: MarketSort = 'fight_date';

export function isMarketSort(value: unknown): value is MarketSort {
  return (
    value === 'fight_date' || value === 'pool_size' || value === 'newest'
  );
}

export interface UseMarketsParams {
  status?: MarketStatus;
  search?: string;
  sort?: MarketSort;
  page?: number;
  limit?: number;
}

export interface UseMarketsResult {
  markets: Market[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

function buildQuery(params: UseMarketsParams): string {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.search) query.set('search', params.search);
  if (params.sort) query.set('sort', params.sort);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  return query.toString();
}

export function useMarkets(params: UseMarketsParams = {}): UseMarketsResult {
  const { status, search, sort = DEFAULT_MARKET_SORT, page, limit } = params;

  const key = useMemo(
    () => `/api/markets?${buildQuery({ status, search, sort, page, limit })}`,
    [status, search, sort, page, limit],
  );

  const { data, error, isLoading, mutate } = useSWR<{
    markets: Market[];
    total: number;
  }>(key, (url: string) => apiFetch(url));

  const refresh = useCallback(() => {
    void mutate();
  }, [mutate]);

  return {
    markets: data?.markets ?? [],
    total: data?.total ?? 0,
    isLoading,
    error: error ?? null,
    refresh,
  };
}

export function useMarketSortFromUrl(
  searchParams: URLSearchParams,
): [MarketSort, (sort: MarketSort) => void] {
  const [sort, setSort] = useState<MarketSort>(() => {
    const value = searchParams.get('sort');
    return isMarketSort(value) ? value : DEFAULT_MARKET_SORT;
  });

  useEffect(() => {
    const value = searchParams.get('sort');
    setSort(isMarketSort(value) ? value : DEFAULT_MARKET_SORT);
  }, [searchParams]);

  return [sort, setSort];
}
