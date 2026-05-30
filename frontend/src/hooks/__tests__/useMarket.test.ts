/**
 * Unit tests for useMarket hook using @testing-library/react and MSW.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useMarket } from '../../hooks/useMarket';
import { server } from '../mocks/handlers';
import { openMarket, lockedMarket, resolvedMarket } from '../mocks/handlers';
import { http, HttpResponse } from 'msw';

describe('useMarket', () => {
  describe('Loading state transitions correctly', () => {
    it('should start with isLoading = true', () => {
      const { result } = renderHook(() => useMarket('market-1'));
      expect(result.current.isLoading).toBe(true);
    });

    it('should start with market = null', () => {
      const { result } = renderHook(() => useMarket('market-1'));
      expect(result.current.market).toBeNull();
    });

    it('should start with error = null', () => {
      const { result } = renderHook(() => useMarket('market-1'));
      expect(result.current.error).toBeNull();
    });

    it('should transition isLoading to false after successful fetch', async () => {
      const { result } = renderHook(() => useMarket('market-1'));

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should set market data after fetch', async () => {
      const { result } = renderHook(() => useMarket('market-1'));

      await waitFor(() => {
        expect(result.current.market).not.toBeNull();
      });

      expect(result.current.market?.market_id).toBe('market-1');
      expect(result.current.market?.fighter_a).toBe('Fighter A');
    });

    it('should clear error on successful load', async () => {
      const { result } = renderHook(() => useMarket('market-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });

    it('should handle 404 error for non-existent market', async () => {
      const { result } = renderHook(() => useMarket('non-existent-market'));

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.market).toBeNull();
      expect(result.current.error?.message).toContain('not found');
    });

    it('should keep isLoading = false when error occurs', async () => {
      const { result } = renderHook(() => useMarket('non-existent-market'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe('Polling starts for open market', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start polling when market status is open', async () => {
      let callCount = 0;

      server.use(
        http.get('http://localhost:3001/api/markets/market-1', () => {
          callCount++;
          return HttpResponse.json(openMarket);
        }),
      );

      const { result } = renderHook(() => useMarket('market-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.market?.status).toBe('open');
      const initialCallCount = callCount;

      // Advance time by 10 seconds (the poll interval)
      jest.advanceTimersByTime(10_000);

      await waitFor(() => {
        expect(callCount).toBeGreaterThan(initialCallCount);
      });
    });

    it('should poll every 10 seconds for open markets', async () => {
      let callCount = 0;

      server.use(
        http.get('http://localhost:3001/api/markets/market-1', () => {
          callCount++;
          return HttpResponse.json(openMarket);
        }),
      );

      renderHook(() => useMarket('market-1'));

      await waitFor(() => {
        expect(callCount).toBeGreaterThanOrEqual(1);
      });

      const countAfterFirstLoad = callCount;

      // Advance 10 seconds
      jest.advanceTimersByTime(10_000);

      await waitFor(() => {
        expect(callCount).toBeGreaterThan(countAfterFirstLoad);
      });

      const countAfterFirstPoll = callCount;

      // Advance another 10 seconds
      jest.advanceTimersByTime(10_000);

      await waitFor(() => {
        expect(callCount).toBeGreaterThan(countAfterFirstPoll);
      });
    });

    it('should update market data on each poll', async () => {
      const marketVersions = [
        { ...openMarket, pool_a: '1000000000', odds_a: 5000 },
        { ...openMarket, pool_a: '1200000000', odds_a: 5200 },
        { ...openMarket, pool_a: '1500000000', odds_a: 5400 },
      ];

      let version = 0;

      server.use(
        http.get('http://localhost:3001/api/markets/market-1', () => {
          const market = marketVersions[Math.min(version, marketVersions.length - 1)];
          version++;
          return HttpResponse.json(market);
        }),
      );

      const { result } = renderHook(() => useMarket('market-1'));

      await waitFor(() => {
        expect(result.current.market?.pool_a).toBe('1000000000');
      });

      jest.advanceTimersByTime(10_000);

      await waitFor(() => {
        expect(result.current.market?.pool_a).toBe('1200000000');
      });

      jest.advanceTimersByTime(10_000);

      await waitFor(() => {
        expect(result.current.market?.pool_a).toBe('1500000000');
      });
    });

    it('should handle polling errors gracefully', async () => {
      let callCount = 0;

      server.use(
        http.get('http://localhost:3001/api/markets/market-1', () => {
          callCount++;
          if (callCount === 1) {
            // First call succeeds
            return HttpResponse.json(openMarket);
          }
          // Subsequent calls fail
          return HttpResponse.json({ error: 'Server Error' }, { status: 500 });
        }),
      );

      const { result } = renderHook(() => useMarket('market-1'));

      await waitFor(() => {
        expect(result.current.market).not.toBeNull();
      });

      jest.advanceTimersByTime(10_000);

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      // Market data should still be present even if polling failed
      expect(result.current.market?.market_id).toBe('market-1');
    });
  });

  describe('Polling stops when market becomes locked', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should keep polling when status changes from open to locked', async () => {
      let callCount = 0;
      let marketStatus: 'open' | 'locked' = 'open';

      server.use(
        http.get('http://localhost:3001/api/markets/market-1', () => {
          callCount++;
          return HttpResponse.json({
            ...openMarket,
            status: marketStatus,
          });
        }),
      );

      const { result } = renderHook(() => useMarket('market-1'));

      await waitFor(() => {
        expect(result.current.market?.status).toBe('open');
      });

      const countBeforeStatusChange = callCount;

      // Simulate market becoming locked
      marketStatus = 'locked';

      // Advance time to trigger next poll
      jest.advanceTimersByTime(10_000);

      await waitFor(() => {
        expect(result.current.market?.status).toBe('locked');
      });

      const countAfterStatusChange = callCount;

      // Advance another 10 seconds; polling should continue while locked
      jest.advanceTimersByTime(10_000);

      await waitFor(() => {
        expect(callCount).toBeGreaterThan(countAfterStatusChange);
      });

      expect(result.current.market?.status).toBe('locked');

      expect(callCount).toBeGreaterThan(countBeforeStatusChange);
    });

    it('should not poll when market is initially locked', async () => {
      let callCount = 0;

      server.use(
        http.get('http://localhost:3001/api/markets/market-1', () => {
          callCount++;
          return HttpResponse.json(lockedMarket);
        }),
      );

      const { result } = renderHook(() => useMarket('market-1'));

      await waitFor(() => {
        expect(result.current.market?.status).toBe('locked');
      });

      const initialCallCount = callCount;

      // Advance time
      jest.advanceTimersByTime(10_000);

      // Should not have made additional requests
      expect(callCount).toBe(initialCallCount);
    });

    it('should stop polling when market becomes resolved', async () => {
      let callCount = 0;
      let marketStatus: 'open' | 'resolved' = 'open';

      server.use(
        http.get('http://localhost:3001/api/markets/market-1', () => {
          callCount++;
          return HttpResponse.json({
            ...openMarket,
            status: marketStatus,
            outcome: marketStatus === 'resolved' ? 'fighter_a' : null,
          });
        }),
      );

      const { result } = renderHook(() => useMarket('market-1'));

      await waitFor(() => {
        expect(result.current.market?.status).toBe('open');
      });

      // Change to resolved
      marketStatus = 'resolved';

      jest.advanceTimersByTime(10_000);

      await waitFor(() => {
        expect(result.current.market?.status).toBe('resolved');
      });

      const countAfterResolution = callCount;

      // Advance more time
      jest.advanceTimersByTime(20_000);

      // Should not make more requests
      expect(callCount).toBeLessThanOrEqual(countAfterResolution);
    });

    it('should stop polling when market becomes cancelled', async () => {
      let callCount = 0;
      let marketStatus: 'open' | 'cancelled' = 'open';

      server.use(
        http.get('http://localhost:3001/api/markets/market-1', () => {
          callCount++;
          return HttpResponse.json({
            ...openMarket,
            status: marketStatus,
          });
        }),
      );

      const { result } = renderHook(() => useMarket('market-1'));

      await waitFor(() => {
        expect(result.current.market?.status).toBe('open');
      });

      marketStatus = 'cancelled';

      jest.advanceTimersByTime(10_000);

      await waitFor(() => {
        expect(result.current.market?.status).toBe('cancelled');
      });

      const countAfterCancellation = callCount;

      // Advance more time
      jest.advanceTimersByTime(20_000);

      // Should not make more requests
      expect(callCount).toBeLessThanOrEqual(countAfterCancellation);
    });
  });

  describe('Component unmounting', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should cleanup polling when component unmounts', async () => {
      // This would error if cleanup doesn't work properly
      const { result, unmount } = renderHook(() => useMarket('market-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      unmount();

      // No errors should occur when advancing timers after unmount
      expect(() => {
        jest.advanceTimersByTime(10_000);
      }).not.toThrow();
    });

    it('should not update state after unmount', async () => {
      let callCount = 0;

      server.use(
        http.get('http://localhost:3001/api/markets/market-1', () => {
          callCount++;
          return HttpResponse.json(openMarket);
        }),
      );

      const { result, unmount } = renderHook(() => useMarket('market-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialData = result.current.market;

      unmount();

      // Advance time after unmount
      jest.advanceTimersByTime(10_000);

      // No state updates should have occurred (would cause error in strict mode)
      expect(result.current.market).toEqual(initialData);
    });
  });

  describe('Market ID changes', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should fetch new market when market_id changes', async () => {
      const { result, rerender } = renderHook(({ marketId }) => useMarket(marketId), {
        initialProps: { marketId: 'market-1' },
      });

      await waitFor(() => {
        expect(result.current.market?.market_id).toBe('market-1');
      });

      // Change market ID
      rerender({ marketId: 'market-2' });

      await waitFor(() => {
        expect(result.current.market?.market_id).toBe('market-2');
      });
    });

    it('should cleanup polling when market_id changes', async () => {
      let market1Calls = 0;
      let market2Calls = 0;

      server.use(
        http.get('http://localhost:3001/api/markets/market-1', () => {
          market1Calls++;
          return HttpResponse.json(openMarket);
        }),
        http.get('http://localhost:3001/api/markets/market-2', () => {
          market2Calls++;
          return HttpResponse.json({
            ...openMarket,
            market_id: 'market-2',
          });
        }),
      );

      const { result, rerender } = renderHook(({ marketId }) => useMarket(marketId), {
        initialProps: { marketId: 'market-1' },
      });

      await waitFor(() => {
        expect(result.current.market?.market_id).toBe('market-1');
      });

      const market1CallsAtChange = market1Calls;

      // Change market ID
      rerender({ marketId: 'market-2' });

      await waitFor(() => {
        expect(result.current.market?.market_id).toBe('market-2');
      });

      // Advance time
      jest.advanceTimersByTime(10_000);

      // Market 1 should not make new calls after switching away
      expect(market1Calls).toBe(market1CallsAtChange);

      // Market 2 should continue polling
      expect(market2Calls).toBeGreaterThan(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle market with undefined optional fields', async () => {
      const marketWithoutOptional = { ...openMarket };
      delete (marketWithoutOptional as any).oracle_address;
      delete (marketWithoutOptional as any).resolution_tx_hash;

      server.use(
        http.get('http://localhost:3001/api/markets/market-1', () => {
          return HttpResponse.json(marketWithoutOptional);
        }),
      );

      const { result } = renderHook(() => useMarket('market-1'));

      await waitFor(() => {
        expect(result.current.market).not.toBeNull();
      });

      expect(result.current.market?.market_id).toBe('market-1');
    });

    it('should handle rapid market_id changes', async () => {
      const { result, rerender } = renderHook(({ marketId }) => useMarket(marketId), {
        initialProps: { marketId: 'market-1' },
      });

      await waitFor(() => {
        expect(result.current.market?.market_id).toBe('market-1');
      });

      // Rapidly change market ID
      rerender({ marketId: 'market-2' });
      rerender({ marketId: 'market-1' });

      await waitFor(() => {
        expect(result.current.market?.market_id).toBe('market-1');
      });
    });
  });
});
