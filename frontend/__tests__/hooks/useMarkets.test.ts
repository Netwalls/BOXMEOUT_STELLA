import { renderHook, act, waitFor } from "@testing-library/react";
import { useMarkets } from "@/hooks/useMarkets";
import type { Market } from "@/lib/api";

const MARKET: Market = {
  id: "mkt-1", contractAddress: "CA1",
  fighterA: { name: "Ali", record: "20-0", nationality: "USA", weightClass: "HW" },
  fighterB: { name: "Foreman", record: "18-2", nationality: "USA", weightClass: "HW" },
  scheduledAt: "2026-07-01T20:00:00Z", bettingEndsAt: "2026-07-01T19:00:00Z",
  status: "Open", outcome: null, poolA: "1000000000", poolB: "500000000",
  totalPool: "1500000000", oracleAddress: "GORACLE", createdBy: "GCREATOR",
};

const mockFetch = (body: unknown, status = 200) =>
  jest.fn().mockResolvedValue({ ok: status < 400, status, json: () => Promise.resolve(body) });

afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test("happy path: returns market list on success", async () => {
  global.fetch = mockFetch([MARKET]);
  const { result } = renderHook(() => useMarkets());
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.markets).toEqual([MARKET]);
  expect(result.current.error).toBeNull();
});

test("error path: sets error on 500", async () => {
  global.fetch = mockFetch({}, 500);
  const { result } = renderHook(() => useMarkets());
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.error).toBeInstanceOf(Error);
  expect(result.current.markets).toEqual([]);
});

test("edge case: clears interval on unmount", async () => {
  global.fetch = mockFetch([MARKET]);
  jest.useFakeTimers();
  const spy = jest.spyOn(globalThis, "clearInterval");
  const { unmount } = renderHook(() => useMarkets());
  unmount();
  expect(spy).toHaveBeenCalled();
});

test("edge case: refetch re-requests data", async () => {
  global.fetch = mockFetch([MARKET]);
  const { result } = renderHook(() => useMarkets());
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  await act(async () => { result.current.refetch(); });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.markets).toEqual([MARKET]);
});
