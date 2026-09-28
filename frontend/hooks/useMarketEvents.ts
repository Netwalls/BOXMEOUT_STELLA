"use client";

import { useEffect, useState } from "react";
import { fetchMarketStats } from "@/lib/api";
import { MarketStats } from "@/lib/api";

export interface UseMarketEventsResult {
  poolA: bigint | null;
  poolB: bigint | null;
  impliedOddsA: number | null;
  impliedOddsB: number | null;
  isLoading: boolean;
  error: Error | null;
}

const POLL_INTERVAL_MS = 4000;
const SSE_RECONNECT_BASE_MS = 1000;
const SSE_RECONNECT_MAX_MS = 30000;

/**
 * Builds the SSE endpoint for a market's live stats stream.
 * Falls back to a relative path when no API base URL is configured.
 */
function buildMarketEventsUrl(market_id: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  return `${base}/markets/${encodeURIComponent(market_id)}/events`;
}

/**
 * Live-updates a market's pool totals by subscribing to the SSE stream for the
 * market, so the odds/pool split on the detail page tracks new bets in real
 * time. Automatically reconnects with backoff, falls back to polling the
 * lightweight stats endpoint if SSE is unsupported or fails, and pauses all
 * activity while the tab is hidden.
 */
export function useMarketEvents(market_id: string): UseMarketEventsResult {
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    let source: EventSource | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    let usingPolling = false;

    const applyStats = (data: MarketStats) => {
      if (cancelled) return;
      setStats(data);
      setError(null);
      setIsLoading(false);
    };

    const poll = async () => {
      try {
        const data = await fetchMarketStats(market_id);
        applyStats(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error("Unknown error"));
          setIsLoading(false);
        }
      }
    };

    const startPolling = () => {
      if (cancelled || usingPolling) return;
      usingPolling = true;
      poll();
      interval = setInterval(poll, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      usingPolling = false;
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      const delay = Math.min(
        SSE_RECONNECT_BASE_MS * 2 ** reconnectAttempts,
        SSE_RECONNECT_MAX_MS
      );
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    const connect = () => {
      if (cancelled) return;
      if (typeof EventSource === "undefined") {
        startPolling();
        return;
      }

      try {
        source = new EventSource(buildMarketEventsUrl(market_id));
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error"));
        startPolling();
        return;
      }

      source.onopen = () => {
        reconnectAttempts = 0;
        stopPolling();
      };

      source.onmessage = (event: MessageEvent<string>) => {
        try {
          const data = JSON.parse(event.data) as MarketStats;
          applyStats(data);
        } catch {
          // Ignore malformed frames; the next event will refresh state.
        }
      };

      source.onerror = () => {
        if (cancelled) return;
        source?.close();
        source = null;
        // Fall back to polling while we wait to reconnect so the UI stays live.
        startPolling();
        scheduleReconnect();
      };
    };

    const start = () => {
      if (cancelled) return;
      connect();
    };

    const stop = () => {
      if (source) {
        source.close();
        source = null;
      }
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      stopPolling();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        reconnectAttempts = 0;
        start();
      }
    };

    if (typeof document !== "undefined" && document.hidden) {
      // Tab is already hidden; wait for it to become visible before starting.
    } else {
      start();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stop();
    };
  }, [market_id]);

  return {
    poolA: stats ? BigInt(stats.poolA) : null,
    poolB: stats ? BigInt(stats.poolB) : null,
    impliedOddsA: stats?.impliedOddsA ?? null,
    impliedOddsB: stats?.impliedOddsB ?? null,
    isLoading,
    error,
  };
}
