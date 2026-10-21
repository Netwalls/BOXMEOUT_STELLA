"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { fetchMarketStats, type MarketStats } from "@/lib/api";
import { ToastContext } from "@/components/ToastProvider";

export interface UseMarketEventsResult {
  poolA: bigint | null;
  poolB: bigint | null;
  impliedOddsA: number | null;
  impliedOddsB: number | null;
  status?: string | null;
  isLoading: boolean;
  error: Error | null;
}

export interface UseMarketEventsOptions {
  hasPosition?: boolean;
  marketTitle?: string;
  initialStatus?: string;
}

export const DEDUP_KEY_PREFIX = "boxmeout_notified_";
export const DEDUP_TTL_MS = 60 * 1000;

/**
 * Checks and marks cross-tab notification status to prevent duplicates across multiple open tabs.
 */
export function shouldNotifyCrossTab(marketId: string, status: string): boolean {
  if (typeof window === "undefined" || !window.localStorage) return true;
  const key = `${DEDUP_KEY_PREFIX}${marketId}_${status}`;
  const now = Date.now();
  const lastTime = localStorage.getItem(key);
  if (lastTime && now - Number(lastTime) < DEDUP_TTL_MS) {
    return false;
  }
  try {
    localStorage.setItem(key, String(now));
  } catch {
    // Ignore storage exceptions in private mode or full storage
  }
  return true;
}

/**
 * Dispatches a native browser notification if explicit opt-in has been granted.
 */
export function sendBrowserNotification(title: string, options?: NotificationOptions): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") {
    try {
      new Notification(title, options);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

const POLL_INTERVAL_MS = 4000;
const SSE_RECONNECT_BASE_MS = 1000;
const SSE_RECONNECT_MAX_MS = 30000;

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
 *
 * When the user has a position in the market, status changes (Resolved, Disputed, Cancelled)
 * trigger toast alerts with direct market links and optional browser notifications.
 */
export function useMarketEvents(
  market_id: string,
  options?: UseMarketEventsOptions
): UseMarketEventsResult {
  const [stats, setStats] = useState<(MarketStats & { status?: string }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const toastContext = useContext(ToastContext);
  const addToast = toastContext?.addToast;
  const prevStatusRef = useRef<string | null>(options?.initialStatus ?? null);

  useEffect(() => {
    let cancelled = false;
    let source: EventSource | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    let usingPolling = false;

    const handleStatusTransition = (newStatus: string) => {
      if (!options?.hasPosition) return;
      if (!shouldNotifyCrossTab(market_id, newStatus)) return;

      const title = `Market ${newStatus}`;
      let message = `Market #${market_id} is now ${newStatus}.`;
      let type: "info" | "success" | "error" = "info";

      if (newStatus === "Resolved") {
        message = "Your market has resolved and is now open for claims!";
        type = "success";
      } else if (newStatus === "Disputed") {
        message = "Your market has been disputed and is pending review.";
        type = "error";
      } else if (newStatus === "Cancelled") {
        message = "Your market was cancelled. Refunds are now available.";
        type = "info";
      }

      addToast?.(message, type, {
        title,
        href: `/markets/${market_id}`,
        action:
          typeof window !== "undefined" &&
          "Notification" in window &&
          Notification.permission === "default"
            ? {
                label: "Enable desktop alerts",
                onClick: () => {
                  Notification.requestPermission();
                },
              }
            : undefined,
      });

      sendBrowserNotification(title, {
        body: message,
        icon: "/favicon.ico",
      });
    };

    const applyStats = (data: MarketStats & { status?: string }) => {
      if (cancelled) return;
      setStats(data);
      setError(null);
      setIsLoading(false);

      if (data.status) {
        if (prevStatusRef.current && prevStatusRef.current !== data.status) {
          handleStatusTransition(data.status);
        }
        prevStatusRef.current = data.status;
      }
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
          const data = JSON.parse(event.data) as MarketStats & { status?: string };
          applyStats(data);
        } catch {
          // Ignore malformed frames; the next event will refresh state.
        }
      };

      source.onerror = () => {
        if (cancelled) return;
        source?.close();
        source = null;
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
  }, [market_id, options?.hasPosition]);

  return {
    poolA: stats ? BigInt(stats.poolA) : null,
    poolB: stats ? BigInt(stats.poolB) : null,
    impliedOddsA: stats?.impliedOddsA ?? null,
    impliedOddsB: stats?.impliedOddsB ?? null,
    status: stats?.status ?? prevStatusRef.current,
    isLoading,
    error,
  };
}
