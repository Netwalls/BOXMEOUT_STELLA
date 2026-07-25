// ============================================================
// BOXMEOUT — Home Page (/)
// Lists all boxing markets with filters, sorting, and pagination.
// ============================================================

'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMarkets } from '../hooks/useMarkets';
import { MarketCard } from '../components/market/MarketCard';
import { MarketCardSkeleton } from '../components/market/MarketCardSkeleton';
import { StatsBanner } from '../components/ui/StatsBanner';
import { MarketFilters } from '../components/market/MarketFilters';

const LIMIT = 12;

export default function HomePage(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  const weightClass = searchParams.get('weight_class') ?? 'All Weight Classes';
  const status = searchParams.get('status') ?? 'All';
  const sort = searchParams.get('sort') ?? 'date_desc';
  const page = Number(searchParams.get('page') ?? '1');

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      // Reset to page 1 on filter/sort change
      if (key !== 'page') params.delete('page');
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const { markets, total, isLoading, error } = useMarkets(
    {
      weight_class: weightClass === 'All Weight Classes' ? undefined : weightClass,
      status: status === 'All' ? undefined : status.toLowerCase(),
    },
    { page, limit: LIMIT },
  );

  const sorted = useMemo(() => {
    const copy = [...markets];
    if (sort === 'date_asc') copy.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    else if (sort === 'date_desc') copy.sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
    else if (sort === 'pool_desc') copy.sort((a, b) => Number(b.total_pool) - Number(a.total_pool));
    return copy;
  }, [markets, sort]);

  const totalPages = Math.ceil(total / LIMIT);
  const showSkeleton = isLoading && markets.length === 0;

  return (
    <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">BOXMEOUT</h1>
        <p className="text-gray-400 text-sm mt-1">Decentralized boxing prediction markets on Stellar</p>
      </div>

      {/* Stats Banner */}
      <StatsBanner />

      {/* Filter bar */}
      <MarketFilters />

      {/* Error banner */}
      {error && (
        <p className="text-red-400 text-sm bg-red-900/20 rounded-lg px-4 py-2">
          Failed to load markets: {error.message}
        </p>
      )}

      {/* Market grid */}
      {showSkeleton ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <MarketCardSkeleton key={i} />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-20 space-y-6">
          <div className="space-y-2">
            <p className="text-4xl">🥊</p>
            <h2 className="text-xl font-semibold text-white">No active markets</h2>
            <p className="text-gray-400">
              {total === 0 ? 'Be the first to create a boxing prediction market' : 'Try adjusting your filters to find more markets'}
            </p>
          </div>
          {total === 0 && (
            <a href="/create" className="inline-block px-6 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 font-semibold text-black text-sm transition-colors">
              Create the first market →
            </a>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((m) => (
            <MarketCard key={m.market_id} market={m} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <button
            disabled={page <= 1}
            onClick={() => setParam('page', String(page - 1))}
            className="px-4 py-2 text-sm rounded-lg bg-gray-800 text-white disabled:opacity-40 hover:bg-gray-700 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <span className="text-gray-400 text-sm">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setParam('page', String(page + 1))}
            className="px-4 py-2 text-sm rounded-lg bg-gray-800 text-white disabled:opacity-40 hover:bg-gray-700 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}
    </main>
  );
}
