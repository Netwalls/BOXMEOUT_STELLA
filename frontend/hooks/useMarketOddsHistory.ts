import { useEffect, useState } from "react";
import { fetchOddsHistory } from "@/lib/api";
import type { OddsSnapshot } from "@/lib/api";

export interface UseMarketOddsHistoryResult {
  snapshots: OddsSnapshot[];
  isLoading: boolean;
  error: Error | null;
}

export function useMarketOddsHistory(marketId: string): UseMarketOddsHistoryResult {
  const [snapshots, setSnapshots] = useState<OddsSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    fetchOddsHistory(marketId)
      .then((data) => {
        if (cancelled) return;
        setSnapshots(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSnapshots([]);
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [marketId]);

  return { snapshots, isLoading, error };
}
