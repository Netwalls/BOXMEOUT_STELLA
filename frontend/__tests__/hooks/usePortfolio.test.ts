import { act, renderHook, waitFor } from "@testing-library/react";
import { usePortfolio } from "@/hooks/usePortfolio";
import {
  BET,
  SUMMARY,
  apiError,
  mockFetchBetsByAddress,
  mockFetchPortfolioSummary,
  pending,
} from "./mockApiClient";

jest.mock("@/lib/api");

let consoleError: jest.SpyInstance;

beforeEach(() => {
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.clearAllMocks();
  consoleError.mockRestore();
});

describe("usePortfolio", () => {
  describe("loading state", () => {
    it("is loading with empty state while both requests are in flight", async () => {
      mockFetchBetsByAddress.mockReturnValue(pending());
      mockFetchPortfolioSummary.mockReturnValue(pending());

      const { result } = renderHook(() => usePortfolio("GADDR1"));

      await waitFor(() => expect(result.current.isLoading).toBe(true));
      expect(result.current.bets).toEqual([]);
      expect(result.current.summary).toBeNull();
    });

    it("stays idle and never calls the API when no wallet is connected", async () => {
      const { result } = renderHook(() => usePortfolio(null));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.bets).toEqual([]);
      expect(result.current.summary).toBeNull();
      expect(mockFetchBetsByAddress).not.toHaveBeenCalled();
      expect(mockFetchPortfolioSummary).not.toHaveBeenCalled();
    });
  });

  describe("success state", () => {
    it("exposes bets and summary for a connected address", async () => {
      mockFetchBetsByAddress.mockResolvedValue([BET]);
      mockFetchPortfolioSummary.mockResolvedValue(SUMMARY);

      const { result } = renderHook(() => usePortfolio("GADDR1"));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.bets).toEqual([BET]);
      expect(result.current.summary).toEqual(SUMMARY);
      expect(mockFetchBetsByAddress).toHaveBeenCalledWith("GADDR1");
      expect(mockFetchPortfolioSummary).toHaveBeenCalledWith("GADDR1");
    });

    it("refetches for the new address when the wallet changes", async () => {
      mockFetchBetsByAddress.mockResolvedValue([BET]);
      mockFetchPortfolioSummary.mockResolvedValue(SUMMARY);

      const { result, rerender } = renderHook(({ address }) => usePortfolio(address), {
        initialProps: { address: "GADDR1" as string | null },
      });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      rerender({ address: "GADDR2" });

      await waitFor(() => expect(mockFetchBetsByAddress).toHaveBeenLastCalledWith("GADDR2"));
    });

    it("refetches on demand", async () => {
      mockFetchBetsByAddress.mockResolvedValue([BET]);
      mockFetchPortfolioSummary.mockResolvedValue(SUMMARY);
      const { result } = renderHook(() => usePortfolio("GADDR1"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        result.current.refetch();
      });

      expect(mockFetchBetsByAddress).toHaveBeenCalledTimes(2);
      expect(mockFetchPortfolioSummary).toHaveBeenCalledTimes(2);
    });
  });

  describe("error state", () => {
    it("keeps empty state and logs when the API fails", async () => {
      mockFetchBetsByAddress.mockRejectedValue(apiError(500, "Internal Server Error"));
      mockFetchPortfolioSummary.mockRejectedValue(apiError(500, "Internal Server Error"));

      const { result } = renderHook(() => usePortfolio("GADDR1"));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.bets).toEqual([]);
      expect(result.current.summary).toBeNull();
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to fetch portfolio data:",
        expect.stringContaining("500")
      );
    });

    it("discards the partial result when only one of the two requests fails", async () => {
      mockFetchBetsByAddress.mockResolvedValue([BET]);
      mockFetchPortfolioSummary.mockRejectedValue(apiError(500, "Internal Server Error"));

      const { result } = renderHook(() => usePortfolio("GADDR1"));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.bets).toEqual([]);
      expect(result.current.summary).toBeNull();
    });

    it("clears loading after a failure so the UI is not stuck in a spinner", async () => {
      mockFetchBetsByAddress.mockRejectedValue(apiError(503, "Service Unavailable"));
      mockFetchPortfolioSummary.mockRejectedValue(apiError(503, "Service Unavailable"));

      const { result } = renderHook(() => usePortfolio("GADDR1"));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });

    it("recovers on a successful retry after a failure", async () => {
      mockFetchBetsByAddress.mockRejectedValueOnce(apiError(500, "Internal Server Error"));
      mockFetchPortfolioSummary.mockRejectedValueOnce(apiError(500, "Internal Server Error"));
      const { result } = renderHook(() => usePortfolio("GADDR1"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockFetchBetsByAddress.mockResolvedValueOnce([BET]);
      mockFetchPortfolioSummary.mockResolvedValueOnce(SUMMARY);
      await act(async () => {
        result.current.refetch();
      });

      expect(result.current.bets).toEqual([BET]);
      expect(result.current.summary).toEqual(SUMMARY);
    });
  });
});
