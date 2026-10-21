import { act, renderHook, waitFor } from "@testing-library/react";
import { useMarket } from "@/hooks/useMarket";
import { MARKET, OTHER_MARKET, apiError, mockFetchMarketById, pending } from "./mockApiClient";

jest.mock("@/lib/api");

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe("useMarket", () => {
  describe("loading state", () => {
    it("starts loading with a null market before the request settles", () => {
      mockFetchMarketById.mockReturnValue(pending());

      const { result } = renderHook(() => useMarket("mkt-1"));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.market).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it("returns to loading while a refetch is in flight", async () => {
      mockFetchMarketById.mockResolvedValueOnce(MARKET);
      const { result } = renderHook(() => useMarket("mkt-1"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockFetchMarketById.mockReturnValue(pending());
      act(() => {
        result.current.refetch();
      });

      await waitFor(() => expect(result.current.isLoading).toBe(true));
    });
  });

  describe("success state", () => {
    it("exposes the fetched market and clears loading", async () => {
      mockFetchMarketById.mockResolvedValue(MARKET);

      const { result } = renderHook(() => useMarket("mkt-1"));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.market).toEqual(MARKET);
      expect(result.current.error).toBeNull();
      expect(mockFetchMarketById).toHaveBeenCalledWith("mkt-1");
    });

    it("refetches when the market id changes", async () => {
      mockFetchMarketById.mockResolvedValueOnce(MARKET).mockResolvedValueOnce(OTHER_MARKET);

      const { result, rerender } = renderHook(({ id }) => useMarket(id), {
        initialProps: { id: "mkt-1" },
      });
      await waitFor(() => expect(result.current.market?.id).toBe("mkt-1"));

      rerender({ id: "mkt-2" });

      await waitFor(() => expect(result.current.market?.id).toBe("mkt-2"));
      expect(mockFetchMarketById).toHaveBeenLastCalledWith("mkt-2");
    });

    it("polls every 10 seconds", async () => {
      jest.useFakeTimers();
      mockFetchMarketById.mockResolvedValue(MARKET);
      renderHook(() => useMarket("mkt-1"));

      await act(async () => {
        jest.advanceTimersByTime(10000);
      });

      expect(mockFetchMarketById).toHaveBeenCalledTimes(2);
    });
  });

  describe("error state", () => {
    it("clears the market and sets an error on 404", async () => {
      mockFetchMarketById.mockRejectedValue(apiError(404, "Not Found"));

      const { result } = renderHook(() => useMarket("missing"));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.market).toBeNull();
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toContain("404");
    });

    it("surfaces a 500 as an Error", async () => {
      mockFetchMarketById.mockRejectedValue(apiError(500, "Internal Server Error"));

      const { result } = renderHook(() => useMarket("mkt-1"));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.error?.message).toContain("500");
    });

    it("wraps a non-Error rejection", async () => {
      mockFetchMarketById.mockRejectedValue("network down");

      const { result } = renderHook(() => useMarket("mkt-1"));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.error).toEqual(new Error("Unknown error"));
    });

    it("clears a previous error once a retry succeeds", async () => {
      mockFetchMarketById.mockRejectedValueOnce(apiError(500, "Internal Server Error"));
      const { result } = renderHook(() => useMarket("mkt-1"));
      await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));

      mockFetchMarketById.mockResolvedValueOnce(MARKET);
      await act(async () => {
        result.current.refetch();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.market).toEqual(MARKET);
    });
  });

  it("stops polling after unmount", async () => {
    jest.useFakeTimers();
    mockFetchMarketById.mockResolvedValue(MARKET);
    const { unmount } = renderHook(() => useMarket("mkt-1"));

    unmount();
    await act(async () => {
      jest.advanceTimersByTime(30000);
    });

    expect(mockFetchMarketById).toHaveBeenCalledTimes(1);
  });
});
