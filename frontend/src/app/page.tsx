// ============================================================
// BOXMEOUT — Home Page (/  )
// Lists all boxing markets with filters and sorting.
// ============================================================

'use client';

// ============================================================
// BOXMEOUT — Home Page (/  )
// Lists all boxing markets with filters and sorting.
// ============================================================

import { Suspense, useCallback } from 'react';
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

function HomePageContent(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  const weightClass = searchParams.get('weight_class') ?? 'All Weight Classes';
  const status = searchParams.get('status') ?? 'All';

  const setWeightClass = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'All Weight Classes') {
      params.delete('weight_class');
    } else {
      params.set('weight_class', value);
    }
    router.replace(`?${params.toString()}`);
  }, [router, searchParams]);

  const setStatus = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'All') {
      params.delete('status');
    } else {
      params.set('status', value.toLowerCase());
    }
    router.replace(`?${params.toString()}`);
  }, [router, searchParams]);

  const { markets, isLoading } = useMarkets({
    weight_class: weightClass === 'All Weight Classes' ? undefined : weightClass,
    status: status === 'All' ? undefined : status.toLowerCase(),
  });

  return (
    <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-xl font-black text-white">BOXMEOUT — Boxing Prediction Market</h1>

      {/* Filter bar — wraps on mobile */}
      <div className="flex flex-wrap gap-3">
        <select
          value={weightClass}
          onChange={(e) => setWeightClass(e.target.value)}
          className="min-h-[44px] bg-gray-800 text-white text-sm rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          {WEIGHT_CLASSES.map((w) => <option key={w}>{w}</option>)}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="min-h-[44px] bg-gray-800 text-white text-sm rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Grid — 1 col mobile, 2 col md, 3 col lg */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <MarketCardSkeleton key={i} />)}
        </div>
      ) : markets.length === 0 ? (
        <p className="text-gray-500 text-center py-16">No markets match your filters.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {markets.map((m) => <MarketCard key={m.market_id} market={m} />)}
        </div>
      )}
    </main>
  );
}

export default function HomePage(): JSX.Element {
  return (
    <Suspense fallback={<main className="max-w-6xl mx-auto px-4 py-6">Loading markets...</main>}>
      <HomePageContent />
    </Suspense>
  );
}
