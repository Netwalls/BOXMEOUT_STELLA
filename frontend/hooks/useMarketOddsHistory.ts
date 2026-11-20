import { useEffect, useMemo, useState } from "react";
import { fetchOddsHistory } from "@/lib/api";
import type { OddsSnapshot } from "@/lib/api";
import { DEFAULT_ODDS_RANGE, filterSnapshotsByRange } from "@/lib/oddsRange";
import type { OddsRange } from "@/lib/oddsRange";

export interface UseMarketOddsHistoryOptions {
  /** Timeframe to filter snapshots to. Defaults to `ALL`. */
  range?: OddsRange;
  /**
   * Snapshots already loaded by the server. When provided, the hook skips its
   * initial fetch and filters these instead.
   */
  initialSnapshots?: OddsSnapshot[];
}

export interface UseMarketOddsHistoryResult {
  snapshots: OddsSnapshot[];
  isLoading: boolean;
  error: Error | null;
}

export function useMarketOddsHistory(
  marketId: string,
  options: UseMarketOddsHistoryOptions = {}
): UseMarketOddsHistoryResult {
  const { range = DEFAULT_ODDS_RANGE, initialSnapshots } = options;
  const [allSnapshots, setAllSnapshots] = useState<OddsSnapshot[]>(initialSnapshots ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(initialSnapshots === undefined);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (initialSnapshots !== undefined) {
      setAllSnapshots(initialSnapshots);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    setIsLoading(true);
    setError(null);

    fetchOddsHistory(marketId)
      .then((data) => {
        if (cancelled) return;
        setAllSnapshots(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setAllSnapshots([]);
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // initialSnapshots is intentionally tracked by identity: a new array from the
    // parent means the server data was refreshed.
  }, [marketId, initialSnapshots]);

  const snapshots = useMemo(
    () => filterSnapshotsByRange(allSnapshots, range),
    [allSnapshots, range]
  );

  return { snapshots, isLoading, error };
}
