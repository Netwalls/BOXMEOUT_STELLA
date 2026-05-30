'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';

interface Stats {
  totalMarkets: number;
  totalVolume: number;
  activeMarkets: number;
}

export function StatsBanner(): JSX.Element {
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/stats`);
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const statItems = [
    { label: 'Total Markets', value: stats?.totalMarkets ?? 0 },
    { label: 'Total Volume', value: `$${(stats?.totalVolume ?? 0).toLocaleString()}` },
    { label: 'Active Markets', value: stats?.activeMarkets ?? 0 },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gradient-to-r from-amber-500/10 to-amber-600/10 rounded-lg p-6 border border-amber-500/20">
      {statItems.map((item) => (
        <div key={item.label} className="text-center">
          {isLoading ? (
            <div className="h-8 bg-gray-700 rounded animate-pulse mb-2" />
          ) : (
            <p className="text-2xl font-bold text-amber-400">{item.value}</p>
          )}
          <p className="text-gray-400 text-sm mt-1">{item.label}</p>
        </div>
      ))}
    </div>
  );
}
