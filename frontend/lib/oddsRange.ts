import type { OddsSnapshot } from "@/lib/api";

/** Timeframes offered on the odds history chart (F-156). */
export const ODDS_RANGES = ["1H", "24H", "7D", "ALL"] as const;
export type OddsRange = (typeof ODDS_RANGES)[number];

export const DEFAULT_ODDS_RANGE: OddsRange = "ALL";

/** Query parameter used to persist the selected range in the URL. */
export const ODDS_RANGE_PARAM = "oddsRange";

const WINDOW_MS: Record<Exclude<OddsRange, "ALL">, number> = {
  "1H": 60 * 60 * 1000,
  "24H": 24 * 60 * 60 * 1000,
  "7D": 7 * 24 * 60 * 60 * 1000,
};

export const ODDS_RANGE_LABELS: Record<OddsRange, string> = {
  "1H": "1 hour",
  "24H": "24 hours",
  "7D": "7 days",
  ALL: "All time",
};

export function isOddsRange(value: unknown): value is OddsRange {
  return typeof value === "string" && (ODDS_RANGES as readonly string[]).includes(value);
}

/**
 * Keeps the snapshots that fall inside `range`, measured back from `now`.
 * `ALL` returns the input unchanged. Snapshots with unparseable timestamps are
 * dropped from windowed ranges.
 */
export function filterSnapshotsByRange(
  snapshots: OddsSnapshot[],
  range: OddsRange,
  now: number = Date.now()
): OddsSnapshot[] {
  if (range === "ALL") return snapshots;
  const cutoff = now - WINDOW_MS[range];
  return snapshots.filter((s) => {
    const t = Date.parse(s.timestamp);
    return !Number.isNaN(t) && t >= cutoff;
  });
}

/**
 * A range is available when it would show at least one point. `ALL` is
 * available whenever there is any history.
 */
export function isOddsRangeAvailable(
  snapshots: OddsSnapshot[],
  range: OddsRange,
  now: number = Date.now()
): boolean {
  return filterSnapshotsByRange(snapshots, range, now).length > 0;
}
