import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export const DEFAULT_MARKET_PAGE_SIZE = 20;

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
  isLoadingMore: boolean;
  hasMore: boolean;
  error: Error | null;
  loadMore: () => void;
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
  const {
    status,
    search,
    sort = DEFAULT_MARKET_SORT,
    page,
    limit = DEFAULT_MARKET_PAGE_SIZE,
  } = params;

  const [currentPage, setCurrentPage] = useState(page ?? 1);
  const [accumulated, setAccumulated] = useState<Market[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Reset pagination whenever filters or sort change.
  useEffect(() => {
    setCurrentPage(page ?? 1);
    setAccumulated([]);
    setIsLoadingMore(false);
  }, [status, search, sort, page]);

  const key = useMemo(
    () =>
      `/api/markets?${buildQuery({
        status,
        search,
        sort,
        page: currentPage,
        limit,
      })}`,
    [status, search, sort, currentPage, limit],
  );

  const { data, error, isLoading, mutate } = useSWR<{
    markets: Market[];
    total: number;
  }>(key, (url: string) => apiFetch(url));

  const total = data?.total ?? 0;

  // Accumulate pages as they arrive, de-duplicating by market id.
  useEffect(() => {
    if (!data?.markets) return;
    setAccumulated((prev) => {
      if (currentPage <= 1) return data.markets;
      const seen = new Set(prev.map((m) => m.id));
      const next = [...prev];
      for (const market of data.markets) {
        if (!seen.has(market.id)) {
          seen.add(market.id);
          next.push(market);
        }
      }
      return next;
    });
    setIsLoadingMore(false);
  }, [data, currentPage]);

  const markets = currentPage <= 1 ? data?.markets ?? [] : accumulated;
  const hasMore = markets.length < total;

  const loadMore = useCallback(() => {
    if (isLoading || isLoadingMore) return;
    setAccumulated((prev) => (currentPage <= 1 ? data?.markets ?? prev : prev));
    setIsLoadingMore(true);
    setCurrentPage((p) => p + 1);
  }, [isLoading, isLoadingMore, currentPage, data]);

  const refresh = useCallback(() => {
    setCurrentPage(page ?? 1);
    setAccumulated([]);
    void mutate();
  }, [mutate, page]);

  return {
    markets,
    total,
    isLoading,
    isLoadingMore,
    hasMore,
    error: error ?? null,
    loadMore,
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
