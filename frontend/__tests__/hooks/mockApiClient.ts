import * as api from "@/lib/api";
import type { Bet, Market, PortfolioSummary } from "@/lib/api";

// Re-export Bet so hook tests can import the fixture type from one place.
export type { Bet };

/**
 * Shared fixtures and typed handles for the mocked `@/lib/api` client.
 * Each hook test file calls `jest.mock("@/lib/api")` itself, since jest.mock is
 * hoisted per module and cannot be applied from an imported helper.
 */

// === Fixtures

export const MARKET: Market = {
  id: "mkt-1",
  contractAddress: "CA1",
  fighterA: { name: "Ali", record: "20-0", nationality: "USA", weightClass: "Heavyweight" },
  fighterB: { name: "Foreman", record: "18-2", nationality: "USA", weightClass: "Heavyweight" },
  scheduledAt: "2026-07-01T20:00:00Z",
  bettingEndsAt: "2026-07-01T19:00:00Z",
  status: "Open",
  outcome: null,
  poolA: "1000000000",
  poolB: "500000000",
  totalPool: "1500000000",
  oracleAddress: "GORACLE",
  createdBy: "GCREATOR",
};

export const OTHER_MARKET: Market = { ...MARKET, id: "mkt-2" };

export const BET: Bet = {
  id: "bet-1",
  marketId: "mkt-1",
  bettor: "GADDR1",
  side: "FighterA",
  amount: "100000000",
  placedAt: "2026-06-20T10:00:00Z",
  claimed: false,
  payout: null,
};

/** An older bet — used to verify most-recent-first sort in useMarketBets. */
export const OLDER_BET: Bet = {
  ...BET,
  id: "bet-0",
  placedAt: "2026-06-10T08:00:00Z",
};

export const SUMMARY: PortfolioSummary = {
  totalStaked: "100000000",
  totalWinnings: "0",
  pendingClaims: "0",
  activeBets: 1,
  completedBets: 0,
  roi: 0,
};

// === Mock handles

export const mockFetchMarkets = api.fetchMarkets as jest.MockedFunction<typeof api.fetchMarkets>;
export const mockFetchMarketById = api.fetchMarketById as jest.MockedFunction<typeof api.fetchMarketById>;
export const mockFetchMarketBets = api.fetchMarketBets as jest.MockedFunction<typeof api.fetchMarketBets>;
export const mockFetchBetsByAddress = api.fetchBetsByAddress as jest.MockedFunction<typeof api.fetchBetsByAddress>;
export const mockFetchPortfolioSummary = api.fetchPortfolioSummary as jest.MockedFunction<typeof api.fetchPortfolioSummary>;

// === Helpers

/**
 * A promise that never settles, so the hook stays in its loading state for the
 * duration of an assertion.
 */
export function pending<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

/**
 * Mirrors what `apiFetch` throws on a non-2xx response. A plain Error is used
 * rather than ApiError because `jest.mock("@/lib/api")` automocks the class,
 * which would break the `instanceof Error` checks inside the hooks.
 */
export function apiError(status: number, message: string): Error {
  return new Error(`${status} ${message}`);
}
