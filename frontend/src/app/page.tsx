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

const WEIGHT_CLASSES = [
  'All Weight Classes',
  'Heavyweight',
  'Light Heavyweight',
  'Super Middleweight',
  'Middleweight',
  'Super Welterweight',
  'Welterweight',
  'Super Lightweight',
  'Lightweight',
  'Super Featherweight',
  'Featherweight',
  'Super Bantamweight',
  'Bantamweight',
  'Super Flyweight',
  'Flyweight',
  'Minimumweight',
];
const STATUSES = ['All', 'Open', 'Resolved'];
const SORT_OPTIONS = [
  { value: 'date_asc', label: 'Date ↑' },
  { value: 'date_desc', label: 'Date ↓' },
  { value: 'pool_desc', label: 'Pool ↓' },
];
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

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Weight class dropdown */}
        <select
          value={weightClass}
          onChange={(e) =>
            setParam('weight_class', e.target.value === 'All Weight Classes' ? null : e.target.value)
          }
          className="min-h-[44px] bg-gray-800 text-white text-sm rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          {WEIGHT_CLASSES.map((w) => (
            <option key={w}>{w}</option>
          ))}
        </select>

        {/* Status tabs */}
        <div className="flex rounded-lg overflow-hidden border border-gray-700">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setParam('status', s === 'All' ? null : s.toLowerCase())}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                status === (s === 'All' ? 'All' : s)
                  ? 'bg-amber-500 text-black'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Sort control */}
        <select
          value={sort}
          onChange={(e) => setParam('sort', e.target.value)}
          className="min-h-[44px] bg-gray-800 text-white text-sm rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-amber-500 ml-auto"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

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
        <p className="text-gray-500 text-center py-16">
          No markets found. Try changing your filters.
        </p>
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
