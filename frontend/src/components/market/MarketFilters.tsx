'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export type SortOption = 'newest' | 'ending_soon' | 'biggest_pool';

const STATUS_TABS = [
  { label: 'All', value: '' },
  { label: 'Open', value: 'open' },
  { label: 'Locked', value: 'locked' },
  { label: 'Resolved', value: 'resolved' },
] as const;

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Ending Soon', value: 'ending_soon' },
  { label: 'Biggest Pool', value: 'biggest_pool' },
];

export interface MarketFilterValues {
  status: string;
  search: string;
  sort: SortOption;
}

interface MarketFiltersProps {
  /** Called whenever any filter/sort value changes */
  onChange?: (values: MarketFilterValues) => void;
}

export function MarketFilters({ onChange }: MarketFiltersProps): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  const status = searchParams.get('status') ?? '';
  const sort = (searchParams.get('sort') ?? 'newest') as SortOption;
  const searchParam = searchParams.get('search') ?? '';

  // Local state for the search input (debounced before hitting URL)
  const [searchInput, setSearchInput] = useState(searchParam);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setParam = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      // Reset to page 1 on any filter/sort change
      params.delete('page');
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  // Sync local input when URL param changes externally
  useEffect(() => {
    setSearchInput(searchParam);
  }, [searchParam]);

  // Debounce search input → URL
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setParam({ search: value || null });
    }, 300);
  };

  // Notify parent of current values
  useEffect(() => {
    onChange?.({ status, search: searchParam, sort });
  }, [status, searchParam, sort, onChange]);

  return (
    <div className="flex flex-wrap gap-3 items-center">
      {/* Status tabs */}
      <div className="flex rounded-lg overflow-hidden border border-gray-700">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setParam({ status: tab.value || null })}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              status === tab.value
                ? 'bg-amber-500 text-black'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Fighter name search */}
      <input
        type="search"
        value={searchInput}
        onChange={(e) => handleSearchChange(e.target.value)}
        placeholder="Search fighters…"
        aria-label="Search fighters"
        className="min-h-[44px] bg-gray-800 text-white text-sm rounded-lg px-3 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 w-48"
      />

      {/* Sort dropdown */}
      <select
        value={sort}
        onChange={(e) => setParam({ sort: e.target.value })}
        aria-label="Sort markets"
        className="min-h-[44px] bg-gray-800 text-white text-sm rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-amber-500 ml-auto"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
