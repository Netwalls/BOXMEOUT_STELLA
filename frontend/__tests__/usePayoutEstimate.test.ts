import { renderHook, waitFor } from "@testing-library/react";
import { usePayoutEstimate } from "@/hooks/usePayoutEstimate";
import * as api from "@/lib/api";

jest.mock("@/lib/api", () => ({
  fetchPayoutEstimate: jest.fn(),
}));

const mockFetchPayoutEstimate = api.fetchPayoutEstimate as jest.Mock;

describe("usePayoutEstimate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("does not call API when side is null", async () => {
    renderHook(() => usePayoutEstimate("market-1", null, 100n));

    jest.advanceTimersByTime(300);

    expect(mockFetchPayoutEstimate).not.toHaveBeenCalled();
  });

  it("does not call API when amount is 0", async () => {
    renderHook(() => usePayoutEstimate("market-1", "FighterA", 0n));

    jest.advanceTimersByTime(300);

    expect(mockFetchPayoutEstimate).not.toHaveBeenCalled();
  });

  it("does not call API when amount is null", async () => {
    renderHook(() => usePayoutEstimate("market-1", "FighterA", null));

    jest.advanceTimersByTime(300);

    expect(mockFetchPayoutEstimate).not.toHaveBeenCalled();
  });

  it("calls API after 300ms debounce with valid inputs", async () => {
    mockFetchPayoutEstimate.mockResolvedValueOnce(150n);

    const { result } = renderHook(() =>
      usePayoutEstimate("market-1", "FighterA", 100n)
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.estimate).toBe(null);

    jest.advanceTimersByTime(300);

    expect(mockFetchPayoutEstimate).toHaveBeenCalledWith(
      "market-1",
      "FighterA",
      100n
    );

    await waitFor(() => {
      expect(result.current.estimate).toBe(150n);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it("cancels previous request when inputs change before debounce completes", async () => {
    mockFetchPayoutEstimate.mockResolvedValueOnce(150n);

    const { rerender } = renderHook(
      ({ side, amount }) => usePayoutEstimate("market-1", side, amount),
      { initialProps: { side: "FighterA" as const, amount: 100n } }
    );

    jest.advanceTimersByTime(150);

    rerender({ side: "FighterB" as const, amount: 200n });

    jest.advanceTimersByTime(300);

    expect(mockFetchPayoutEstimate).toHaveBeenCalledTimes(1);
    expect(mockFetchPayoutEstimate).toHaveBeenCalledWith(
      "market-1",
      "FighterB",
      200n
    );
  });

  it("debounces multiple rapid changes", async () => {
    mockFetchPayoutEstimate.mockResolvedValueOnce(150n);

    const { rerender } = renderHook(
      ({ amount }) => usePayoutEstimate("market-1", "FighterA", amount),
      { initialProps: { amount: 100n } }
    );

    jest.advanceTimersByTime(100);
    rerender({ amount: 150n });

    jest.advanceTimersByTime(100);
    rerender({ amount: 200n });

    jest.advanceTimersByTime(300);

    // Should only call API once with final value
    expect(mockFetchPayoutEstimate).toHaveBeenCalledTimes(1);
    expect(mockFetchPayoutEstimate).toHaveBeenCalledWith(
      "market-1",
      "FighterA",
      200n
    );
  });

  it("handles API errors gracefully", async () => {
    mockFetchPayoutEstimate.mockRejectedValueOnce(new Error("API error"));

    const { result } = renderHook(() =>
      usePayoutEstimate("market-1", "FighterA", 100n)
    );

    jest.advanceTimersByTime(300);

    await waitFor(() => {
      expect(result.current.estimate).toBe(null);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it("resets estimate when side becomes null", async () => {
    mockFetchPayoutEstimate.mockResolvedValueOnce(150n);

    const { result, rerender } = renderHook(
      ({ side }) => usePayoutEstimate("market-1", side, 100n),
      { initialProps: { side: "FighterA" as const } }
    );

    jest.advanceTimersByTime(300);

    await waitFor(() => {
      expect(result.current.estimate).toBe(150n);
    });

    rerender({ side: null });

    expect(result.current.estimate).toBe(null);
  });

  it("resets estimate when amount becomes 0", async () => {
    mockFetchPayoutEstimate.mockResolvedValueOnce(150n);

    const { result, rerender } = renderHook(
      ({ amount }) => usePayoutEstimate("market-1", "FighterA", amount),
      { initialProps: { amount: 100n } }
    );

    jest.advanceTimersByTime(300);

    await waitFor(() => {
      expect(result.current.estimate).toBe(150n);
    });

    rerender({ amount: 0n });

    expect(result.current.estimate).toBe(null);
  });
});
