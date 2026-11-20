import type { Bet, Market } from "@/lib/api";

/** Mock data only — stories must not touch the network or a wallet. */
export const baseMarket: Market = {
  id: "market-123",
  contractAddress: "CA1",
  fighterA: { name: "Alice Fighter", record: "15-3", nationality: "USA", weightClass: "Middleweight" },
  fighterB: { name: "Bob Fighter", record: "12-5", nationality: "Canada", weightClass: "Middleweight" },
  scheduledAt: "2026-07-15T20:00:00Z",
  bettingEndsAt: "2026-07-15T19:00:00Z",
  status: "Open",
  outcome: null,
  poolA: "1000000000",
  poolB: "500000000",
  totalPool: "1500000000",
  oracleAddress: "GORACLE",
  createdBy: "GCREATOR",
};

export const baseBet: Bet = {
  id: "bet-1",
  marketId: "market-123",
  bettor: "GBETTOR",
  side: "FighterA",
  amount: "100000000",
  placedAt: "2026-06-20T10:00:00Z",
  claimed: false,
  payout: null,
};
