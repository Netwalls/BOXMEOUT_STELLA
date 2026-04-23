// ============================================================
// BOXMEOUT — CountdownTimer Component
// ============================================================

import { useMarketCountdown } from '@/hooks/useMarketCountdown';

interface CountdownTimerProps {
  /** ISO 8601 timestamp of fight start */
  scheduled_at: string;
  /** Optional label prefix (e.g. "Starts in") */
  label?: string;
}

/**
 * Renders a live countdown to the fight start time.
 * Uses the useMarketCountdown hook internally.
 *
 * Display:
 *   "Starts in 2h 14m 32s"   → while countdown is running
 *   "LIVE"                    → when fight has started (red pulsing badge)
 *   "ENDED"                   → after resolution window passed
 */
export function CountdownTimer({
  scheduled_at,
  label = 'Starts in',
}: CountdownTimerProps): JSX.Element {
  const state = useMarketCountdown(scheduled_at);

  if (state === 'LIVE') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white animate-pulse">
        LIVE
      </span>
    );
  }

  if (state === 'ENDED') {
    return <span className="text-sm text-gray-400">ENDED</span>;
  }

  return (
    <span className="text-sm text-gray-200">
      {label} {state}
    </span>
  );
}
