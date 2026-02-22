import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  RealtimeOddsBroadcaster,
  getDirection,
  hasSignificantChange,
  type MarketOdds,
} from '../../src/websocket/realtime.js';

describe('RealtimeOddsBroadcaster', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('polls subscribed markets every 5 seconds', async () => {
    const fetchMarketOdds = vi
      .fn<() => Promise<MarketOdds>>()
      .mockResolvedValue({ yes: 50, no: 50 });
    const broadcast = vi.fn();

    const service = new RealtimeOddsBroadcaster(fetchMarketOdds, broadcast);
    service.subscribe('market-1', 'socket-1');
    service.start();

    await vi.advanceTimersByTimeAsync(15000);

    expect(fetchMarketOdds).toHaveBeenCalledTimes(3);
    service.stop();
  });

  it('broadcasts only when odds change is greater than 1%', async () => {
    const fetchMarketOdds = vi
      .fn<(marketId: string) => Promise<MarketOdds>>()
      .mockResolvedValueOnce({ yes: 50, no: 50 }) // baseline
      .mockResolvedValueOnce({ yes: 50.5, no: 49.5 }) // +1.0% relative -> do not broadcast
      .mockResolvedValueOnce({ yes: 51.1, no: 48.9 }); // +2.2% relative -> broadcast

    const broadcast = vi.fn();

    const service = new RealtimeOddsBroadcaster(fetchMarketOdds, broadcast);
    service.subscribe('market-1', 'socket-1');
    service.start();

    await vi.advanceTimersByTimeAsync(15000);

    expect(broadcast).toHaveBeenCalledTimes(1);
    const payload = broadcast.mock.calls[0][1];
    expect(payload.marketId).toBe('market-1');
    expect(payload.direction).toBe('YES');
    expect(payload.type).toBe('odds_changed');
    service.stop();
  });

  it('does not broadcast when change is less than or equal to 1%', async () => {
    const fetchMarketOdds = vi
      .fn<(marketId: string) => Promise<MarketOdds>>()
      .mockResolvedValueOnce({ yes: 50, no: 50 })
      .mockResolvedValueOnce({ yes: 50.5, no: 49.5 })
      .mockResolvedValueOnce({ yes: 50.4, no: 49.6 });
    const broadcast = vi.fn();

    const service = new RealtimeOddsBroadcaster(fetchMarketOdds, broadcast);
    service.subscribe('market-1', 'socket-1');
    service.start();

    await vi.advanceTimersByTimeAsync(15000);

    expect(broadcast).not.toHaveBeenCalled();
    service.stop();
  });
});

describe('odds helpers', () => {
  it('computes significant change threshold correctly', () => {
    expect(
      hasSignificantChange({ yes: 50, no: 50 }, { yes: 50.5, no: 49.5 }, 1)
    ).toBe(false);
    expect(
      hasSignificantChange({ yes: 50, no: 50 }, { yes: 51.1, no: 48.9 }, 1)
    ).toBe(true);
  });

  it('returns YES when YES odds increase and NO when YES odds decrease', () => {
    expect(getDirection({ yes: 40, no: 60 }, { yes: 41, no: 59 })).toBe('YES');
    expect(getDirection({ yes: 60, no: 40 }, { yes: 59, no: 41 })).toBe('NO');
  });
});
