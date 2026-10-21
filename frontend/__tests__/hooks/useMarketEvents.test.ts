import { renderHook, act } from "@testing-library/react";
import { useMarketEvents } from "@/hooks/useMarketEvents";
import * as api from "@/lib/api";

jest.mock("@/lib/api");

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  emitOpen() {
    this.onopen?.(new Event("open"));
  }

  emitMessage(data: any) {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(data) }));
  }

  emitError() {
    this.onerror?.(new Event("error"));
  }
}

describe("useMarketEvents", () => {
  const mockFetchMarketStats = api.fetchMarketStats as jest.Mock;
  const originalEventSource = global.EventSource;
  let hiddenSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    MockEventSource.instances = [];
    (global as any).EventSource = MockEventSource;
    hiddenSpy = jest.spyOn(document, "hidden", "get").mockReturnValue(false);
    mockFetchMarketStats.mockResolvedValue({
      marketId: "mkt-1",
      poolA: "1000",
      poolB: "2000",
      impliedOddsA: 33.3,
      impliedOddsB: 66.7,
      totalBets: 5,
    });
  });

  afterEach(() => {
    global.EventSource = originalEventSource;
    hiddenSpy.mockRestore();
  });

  it("connects to EventSource and updates stats on message", () => {
    const { result } = renderHook(() => useMarketEvents("mkt-1"));

    expect(MockEventSource.instances).toHaveLength(1);
    const es = MockEventSource.instances[0];
    expect(es.url).toContain("/markets/mkt-1/events");
    expect(result.current.isLoading).toBe(true);

    act(() => {
      es.emitOpen();
      es.emitMessage({
        marketId: "mkt-1",
        poolA: "5000",
        poolB: "10000",
        impliedOddsA: 33.3,
        impliedOddsB: 66.7,
        totalBets: 10,
      });
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.poolA).toBe(5000n);
    expect(result.current.poolB).toBe(10000n);
    expect(result.current.impliedOddsA).toBe(33.3);
    expect(result.current.impliedOddsB).toBe(66.7);
    expect(result.current.error).toBeNull();
  });

  it("ignores malformed SSE message data without updating state or crashing", () => {
    const { result } = renderHook(() => useMarketEvents("mkt-1"));
    const es = MockEventSource.instances[0];

    act(() => {
      es.onmessage?.(new MessageEvent("message", { data: "invalid json string" }));
    });

    expect(result.current.poolA).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("falls back to polling on SSE error and schedules reconnect", async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useMarketEvents("mkt-1"));
    const es = MockEventSource.instances[0];

    await act(async () => {
      es.emitError();
      await Promise.resolve();
    });

    expect(es.closed).toBe(true);
    expect(mockFetchMarketStats).toHaveBeenCalledWith("mkt-1");

    // Advance reconnect backoff timer (1000ms)
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(MockEventSource.instances).toHaveLength(2);
    jest.useRealTimers();
  });

  it("falls back to polling immediately when EventSource is not supported", async () => {
    delete (global as any).EventSource;
    let hookResult: any;

    await act(async () => {
      hookResult = renderHook(() => useMarketEvents("mkt-1"));
      await Promise.resolve();
    });

    expect(mockFetchMarketStats).toHaveBeenCalledWith("mkt-1");
    expect(hookResult.result.current.poolA).toBe(1000n);
    expect(hookResult.result.current.poolB).toBe(2000n);
  });

  it("pauses SSE connection on tab hide and reconnects on tab visible", () => {
    const { result } = renderHook(() => useMarketEvents("mkt-1"));
    expect(MockEventSource.instances).toHaveLength(1);
    const initialEs = MockEventSource.instances[0];

    // Hide tab
    hiddenSpy.mockReturnValue(true);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(initialEs.closed).toBe(true);

    // Show tab
    hiddenSpy.mockReturnValue(false);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(MockEventSource.instances).toHaveLength(2);
  });

  it("cleans up connection and listeners on unmount", () => {
    const { unmount } = renderHook(() => useMarketEvents("mkt-1"));
    const es = MockEventSource.instances[0];

    unmount();
    expect(es.closed).toBe(true);
  });
});
