import { renderHook, act, waitFor } from "@testing-library/react";
import { useMarket } from "@/hooks/useMarket";
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

test("happy path: returns market on success", async () => {
  global.fetch = mockFetch(MARKET);
  const { result } = renderHook(() => useMarket("mkt-1"));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.market).toEqual(MARKET);
  expect(result.current.error).toBeNull();
});

test("error path: sets error on 404", async () => {
  global.fetch = mockFetch({}, 404);
  const { result } = renderHook(() => useMarket("mkt-1"));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.error).toBeInstanceOf(Error);
  expect(result.current.market).toBeNull();
});

test("edge case: clears 10s interval on unmount", async () => {
  global.fetch = mockFetch(MARKET);
  jest.useFakeTimers();
  const spy = jest.spyOn(globalThis, "clearInterval");
  const { unmount } = renderHook(() => useMarket("mkt-1"));
  unmount();
  expect(spy).toHaveBeenCalled();
});

test("edge case: re-fetches when market_id changes", async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MARKET) })
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ...MARKET, id: "mkt-2" }) });
  const { result, rerender } = renderHook(({ id }) => useMarket(id), { initialProps: { id: "mkt-1" } });
  await waitFor(() => expect(result.current.market?.id).toBe("mkt-1"));
  rerender({ id: "mkt-2" });
  await waitFor(() => expect(result.current.market?.id).toBe("mkt-2"));
});
