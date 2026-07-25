// ============================================================
// BOXMEOUT — useMarketEvents Hook (F-24)
// ============================================================

import { useEffect, useRef, useCallback, useState } from 'react';

export interface MarketEvent {
  type: 'odds_update' | 'resolution' | 'cancellation' | 'dispute';
  market_id: string;
  timestamp: string;
  data: Record<string, any>;
}

export interface UseMarketEventsResult {
  isConnected: boolean;
  error: Error | null;
  subscribe: (marketId: string, callback: (event: MarketEvent) => void) => () => void;
}

interface ActiveSubscription {
  marketId: string;
  callback: (event: MarketEvent) => void;
}

/**
 * Hook for subscribing to live market events over WebSocket/SSE.
 * Handles automatic reconnection on connection drop.
 * Cleans up subscriptions on unmount.
 * Returns subscribe function to listen for specific market events.
 */
export function useMarketEvents(): UseMarketEventsResult {
  const wsRef = useRef<WebSocket | null>(null);
  const subscriptionsRef = useRef<Map<string, Set<(event: MarketEvent) => void>>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000;

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001';
      wsRef.current = new WebSocket(`${wsUrl}/api/market-events`);

      wsRef.current.onopen = () => {
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as MarketEvent;
          const callbacks = subscriptionsRef.current.get(data.market_id);
          if (callbacks) {
            callbacks.forEach(cb => cb(data));
          }
        } catch (e) {
          console.error('Failed to parse market event', e);
        }
      };

      wsRef.current.onerror = (event) => {
        const err = new Error('WebSocket error');
        setError(err);
        setIsConnected(false);
      };

      wsRef.current.onclose = () => {
        setIsConnected(false);
        attemptReconnect();
      };
    } catch (e: any) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      setIsConnected(false);
      attemptReconnect();
    }
  }, []);

  const attemptReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      setError(new Error('Max reconnection attempts exceeded'));
      return;
    }

    reconnectAttemptsRef.current += 1;
    const delay = baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current - 1);

    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [connect]);

  const subscribe = useCallback(
    (marketId: string, callback: (event: MarketEvent) => void): (() => void) => {
      if (!subscriptionsRef.current.has(marketId)) {
        subscriptionsRef.current.set(marketId, new Set());
      }
      subscriptionsRef.current.get(marketId)!.add(callback);

      return () => {
        const callbacks = subscriptionsRef.current.get(marketId);
        if (callbacks) {
          callbacks.delete(callback);
          if (callbacks.size === 0) {
            subscriptionsRef.current.delete(marketId);
          }
        }
      };
    },
    [],
  );

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      subscriptionsRef.current.clear();
    };
  }, [connect]);

  return { isConnected, error, subscribe };
}
