import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import type { Market, Bet, OddsSnapshot, PortfolioSummary } from "@/lib/api";

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

export const SNAPSHOT: OddsSnapshot = {
  timestamp: "2026-06-20T10:00:00Z",
  poolA: "1000000000",
  poolB: "500000000",
  oddsA: 66.7,
  oddsB: 33.3,
};

export const SUMMARY: PortfolioSummary = {
  totalStaked: "100000000",
  totalWinnings: "0",
  pendingClaims: "0",
  activeBets: 1,
  completedBets: 0,
  roi: 0,
};

export const server = setupServer(
  http.get("http://localhost/api/markets", () => HttpResponse.json([MARKET])),
  http.get("http://localhost/api/markets/mkt-1", () => HttpResponse.json(MARKET)),
  http.get("http://localhost/api/markets/mkt-1/odds-history", () => HttpResponse.json([SNAPSHOT])),
  http.get("http://localhost/api/bets/GADDR1", () => HttpResponse.json([BET])),
  http.get("http://localhost/api/bets/GADDR1/portfolio", () => HttpResponse.json(SUMMARY)),
  http.get("http://localhost/api/bets/payout-estimate", () =>
    HttpResponse.json({ estimate: "150000000" })
  ),
  http.post("http://localhost/api/markets/mkt-1/bets", () => HttpResponse.json(BET)),
  http.post("http://localhost/api/markets/mkt-1/bets/bet-1/claim", () =>
    HttpResponse.json({ betId: "bet-1", bettor: "GADDR1", payout: "150000000", claimedAt: "2026-06-21T10:00:00Z" })
  ),
  http.post("http://localhost/api/markets", () => HttpResponse.json({ market_id: "mkt-new" }))
);
