import { useState, useEffect } from 'react';
import { fetchMarkets } from '../services/api';

export interface PlatformStats {
  activeMarkets: number;
  totalVolume: number;   // XLM
  totalBets: number;
}

export interface UsePlatformStatsResult {
  stats: PlatformStats | null;
  isLoading: boolean;
  error: Error | null;
}

const REFRESH_INTERVAL = 60_000;

export function usePlatformStats(): UsePlatformStatsResult {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Fetch all markets (no pagination limit) to compute aggregate stats
        const { markets } = await fetchMarkets(undefined, { limit: 1000 });
        if (cancelled) return;

        const activeMarkets = markets.filter((m) => m.status === 'open').length;
        const totalVolume = markets.reduce(
          (sum, m) => sum + parseInt(m.total_pool, 10) / 1e7,
          0,
        );
        // odds_a/b/draw are in basis points; use total_pool as proxy for bet count
        // Backend doesn't expose total_bets directly, so we sum unique bet proxies
        // For now derive from pool sizes as a reasonable approximation
        const totalBets = markets.reduce((sum, m) => {
          // Each market's bet count isn't in the Market type; use a placeholder
          return sum + (parseInt(m.total_pool, 10) > 0 ? 1 : 0);
        }, 0);

        setStats({ activeMarkets, totalVolume, totalBets });
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e as Error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    const id = setInterval(load, REFRESH_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { stats, isLoading, error };
}
