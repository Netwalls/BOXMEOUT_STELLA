import { renderHook, waitFor } from "@testing-library/react";
import { usePortfolio } from "@/hooks/usePortfolio";
import type { Market, Bet, PortfolioSummary } from "@/lib/api";

const MARKET: Market = {
  id: "mkt-1", contractAddress: "CA1",
  fighterA: { name: "Ali", record: "20-0", nationality: "USA", weightClass: "HW" },
  fighterB: { name: "Foreman", record: "18-2", nationality: "USA", weightClass: "HW" },
  scheduledAt: "2026-07-01T20:00:00Z", bettingEndsAt: "2026-07-01T19:00:00Z",
  status: "Open", outcome: null, poolA: "1000000000", poolB: "500000000",
  totalPool: "1500000000", oracleAddress: "GORACLE", createdBy: "GCREATOR",
};
const BET: Bet = { id: "bet-1", marketId: "mkt-1", bettor: "GADDR1", side: "FighterA", amount: "100000000", placedAt: "2026-06-20T10:00:00Z", claimed: false, payout: null };
const SUMMARY: PortfolioSummary = { totalStaked: "100000000", totalWinnings: "0", pendingClaims: "0", activeBets: 1, completedBets: 0, roi: 0 };

afterEach(() => jest.restoreAllMocks());

test("happy path: fetches bets, summary and markets for a valid address", async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([BET]) })      // fetchBetsByAddress
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(SUMMARY) })    // fetchPortfolioSummary
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MARKET) });    // fetchMarketById mkt-1
  const { result } = renderHook(() => usePortfolio("GADDR1"));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.bets).toEqual([BET]);
  expect(result.current.summary).toEqual(SUMMARY);
  expect(result.current.markets["mkt-1"]).toEqual(MARKET);
});

test("error path: keeps empty state when API returns 500", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
  const { result } = renderHook(() => usePortfolio("GADDR1"));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.bets).toEqual([]);
  expect(result.current.summary).toBeNull();
});

test("edge case: null address — never fetches, stays idle", () => {
  const { result } = renderHook(() => usePortfolio(null));
  expect(result.current.isLoading).toBe(false);
  expect(result.current.bets).toEqual([]);
  expect(result.current.summary).toBeNull();
});
