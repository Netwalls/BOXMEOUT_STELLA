'use client';

import { usePlatformStats } from '../../hooks/usePlatformStats';

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900 rounded-xl p-4 text-center">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-lg font-bold text-white mt-1">{value}</p>
    </div>
  );
}

function StatCellSkeleton() {
  return (
    <div className="bg-gray-900 rounded-xl p-4 text-center space-y-2 animate-pulse">
      <div className="h-3 w-24 bg-gray-700 rounded mx-auto" />
      <div className="h-6 w-20 bg-gray-700 rounded mx-auto" />
    </div>
  );
}

export function PlatformStatsBanner(): JSX.Element {
  const { stats, isLoading } = usePlatformStats();

  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-3 gap-3">
        <StatCellSkeleton />
        <StatCellSkeleton />
        <StatCellSkeleton />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      <StatCell label="Active Markets" value={stats.activeMarkets.toLocaleString()} />
      <StatCell
        label="Total Volume"
        value={`${stats.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} XLM`}
      />
      <StatCell label="Total Bets Placed" value={stats.totalBets.toLocaleString()} />
    </div>
  );
}
