// ============================================================
// BOXMEOUT — useMarketCountdown Hook
// ============================================================

import { useState, useEffect } from 'react';

/**
 * Returns a live human-readable countdown string to the fight start time.
 *
 * Return values by time remaining:
 *   > 0s remaining  → "Xh Ym Zs"  (e.g. "2h 14m 32s")
 *   0s (at start)   → "LIVE"
 *   > resolution window passed → "ENDED"
 *
 * Updates every 1 second.
 * Cleans up the interval when the component unmounts.
 *
 * @param scheduled_at  ISO 8601 timestamp string of fight start
 */
const RESOLUTION_WINDOW_MS = 24 * 60 * 60 * 1000;

function compute(scheduled_at_ms: number): string {
  const now = Date.now();
  if (now >= scheduled_at_ms + RESOLUTION_WINDOW_MS) return 'ENDED';
  if (now >= scheduled_at_ms) return 'LIVE';
  const diff = Math.floor((scheduled_at_ms - now) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function useMarketCountdown(scheduled_at: string): string {
  const ms = new Date(scheduled_at).getTime();
  const [label, setLabel] = useState(() => compute(ms));

  useEffect(() => {
    const id = setInterval(() => setLabel(compute(ms)), 1000);
    return () => clearInterval(id);
  }, [ms]);

  return label;
}
