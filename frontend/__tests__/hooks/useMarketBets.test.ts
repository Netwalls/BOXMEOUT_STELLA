import { act, renderHook, waitFor } from "@testing-library/react";
import { useMarketBets } from "@/hooks/useMarketBets";
import { BET, OLDER_BET, apiError, mockFetchMarketBets, pending } from "./mockApiClient";

jest.mock("@/lib/api");

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe("useMarketBets", () => {
  describe("loading state", () => {
    it("starts loading with an empty bets list before the request settles", () => {
      mockFetchMarketBets.mockReturnValue(pending());

      const { result } = renderHook(() => useMarketBets("mkt-1"));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.bets).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it("returns to loading while a refetch is in flight", async () => {
      mockFetchMarketBets.mockResolvedValueOnce([BET]);
      const { result } = renderHook(() => useMarketBets("mkt-1"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockFetchMarketBets.mockReturnValue(pending());
      act(() => {
        result.current.refetch();
      });

      await waitFor(() => expect(result.current.isLoading).toBe(true));
    });
  });

  describe("success state", () => {
    it("exposes fetched bets and clears loading", async () => {
      mockFetchMarketBets.mockResolvedValue([BET]);

      const { result } = renderHook(() => useMarketBets("mkt-1"));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.bets).toHaveLength(1);
      expect(result.current.error).toBeNull();
    });

    it("passes the market id to the API client", async () => {
      mockFetchMarketBets.mockResolvedValue([BET]);

      const { result } = renderHook(() => useMarketBets("mkt-1"));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(mockFetchMarketBets).toHaveBeenCalledWith("mkt-1");
    });

    it("sorts bets most-recent-first", async () => {
      // OLDER_BET (2026-06-10) is returned first from the API; BET (2026-06-20) second.
      mockFetchMarketBets.mockResolvedValue([OLDER_BET, BET]);

      const { result } = renderHook(() => useMarketBets("mkt-1"));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.bets[0].id).toBe("bet-1"); // newer first
      expect(result.current.bets[1].id).toBe("bet-0"); // older second
    });

    it("refetches on demand", async () => {
      mockFetchMarketBets.mockResolvedValue([BET]);
      const { result } = renderHook(() => useMarketBets("mkt-1"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        result.current.refetch();
      });

      expect(mockFetchMarketBets).toHaveBeenCalledTimes(2);
    });
  });

  describe("error state", () => {
    it("surfaces an API failure as an Error and keeps bets empty", async () => {
      mockFetchMarketBets.mockRejectedValue(apiError(500, "Internal Server Error"));

      const { result } = renderHook(() => useMarketBets("mkt-1"));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toContain("500");
      expect(result.current.bets).toEqual([]);
    });

    it("wraps a non-Error rejection", async () => {
      mockFetchMarketBets.mockRejectedValue("network down");

      const { result } = renderHook(() => useMarketBets("mkt-1"));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.error).toEqual(new Error("Unknown error"));
    });

    it("clears a previous error once a retry succeeds", async () => {
      mockFetchMarketBets.mockRejectedValueOnce(apiError(500, "Internal Server Error"));
      const { result } = renderHook(() => useMarketBets("mkt-1"));
      await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));

      mockFetchMarketBets.mockResolvedValueOnce([BET]);
      await act(async () => {
        result.current.refetch();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.bets).toHaveLength(1);
    });
  });
});
