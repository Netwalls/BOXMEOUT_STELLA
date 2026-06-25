import { renderHook, act, waitFor } from "@testing-library/react";
import { useMarketOddsHistory } from "@/hooks/useMarketOddsHistory";
import type { OddsSnapshot } from "@/lib/api";

const SNAPSHOT: OddsSnapshot = { timestamp: "2026-06-20T10:00:00Z", poolA: "1000000000", poolB: "500000000", oddsA: 66.7, oddsB: 33.3 };

afterEach(() => jest.restoreAllMocks());

test("happy path: returns snapshots on success", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([SNAPSHOT]) });
  const { result } = renderHook(() => useMarketOddsHistory("mkt-1"));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.snapshots).toEqual([SNAPSHOT]);
});

test("error path: returns empty snapshots on fetch failure", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
  const { result } = renderHook(() => useMarketOddsHistory("mkt-1"));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.snapshots).toEqual([]);
});

test("edge case: does not update state after unmount", async () => {
  let resolve!: (v: unknown) => void;
  global.fetch = jest.fn().mockReturnValue(new Promise((res) => { resolve = res; }));
  const { result, unmount } = renderHook(() => useMarketOddsHistory("mkt-1"));
  expect(result.current.isLoading).toBe(true);
  unmount();
  await act(async () => { resolve({ ok: true, json: () => Promise.resolve([SNAPSHOT]) }); });
  // No React setState-on-unmounted error = test passes
});
