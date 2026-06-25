import { renderHook, act, waitFor } from "@testing-library/react";
import { usePayoutEstimate } from "@/hooks/usePayoutEstimate";

afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test("happy path: returns estimate after 300ms debounce", async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ estimate: "150000000" }) });
  const { result } = renderHook(() => usePayoutEstimate("mkt-1", "FighterA", BigInt(100_000_000)));
  expect(result.current.estimate).toBeNull();
  await act(async () => { jest.advanceTimersByTime(300); });
  await waitFor(() => expect(result.current.estimate).toBe(BigInt(150_000_000)));
});

test("error path: estimate stays null when fetch fails", async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
  const { result } = renderHook(() => usePayoutEstimate("mkt-1", "FighterA", BigInt(100_000_000)));
  await act(async () => { jest.advanceTimersByTime(300); });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.estimate).toBeNull();
});

test("edge case: debounce — rapid re-render cancels previous timeout", async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ estimate: "150000000" }) });
  const spy = jest.spyOn(globalThis, "clearTimeout");
  const { rerender } = renderHook(
    ({ amount }: { amount: bigint }) => usePayoutEstimate("mkt-1", "FighterA", amount),
    { initialProps: { amount: BigInt(100_000_000) } }
  );
  rerender({ amount: BigInt(200_000_000) });
  expect(spy).toHaveBeenCalled();
});

test("edge case: null amount skips fetch", () => {
  const { result } = renderHook(() => usePayoutEstimate("mkt-1", "FighterA", null));
  expect(result.current.estimate).toBeNull();
  expect(result.current.isLoading).toBe(false);
});

test("edge case: null side skips fetch", () => {
  const { result } = renderHook(() => usePayoutEstimate("mkt-1", null, BigInt(100_000_000)));
  expect(result.current.estimate).toBeNull();
  expect(result.current.isLoading).toBe(false);
});
