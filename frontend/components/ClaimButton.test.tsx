import React from "react";
import { render, screen } from "@testing-library/react";
import { ClaimButton } from "./ClaimButton";
import { Bet, Market, MarketStatus, Outcome } from "@/lib/api";

jest.mock("@/hooks/useClaimWinnings", () => ({
  useClaimWinnings: () => ({ claim: jest.fn() }),
}));
jest.mock("@/hooks/useClaimRefund", () => ({
  useClaimRefund: () => ({ claimRefund: jest.fn() }),
}));

const RESOLVED_AT = "2026-10-01T12:00:00Z";
const RESOLVED_AT_MS = new Date(RESOLVED_AT).getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

function makeMarket(status: MarketStatus, outcome: Outcome | null): Market {
  return {
    id: "m-1",
    contractAddress: "C1",
    fighterA: { name: "Maya Chen", record: "10-0", nationality: "US", weightClass: "Welter" },
    fighterB: { name: "Rico Alvarez", record: "9-1", nationality: "MX", weightClass: "Welter" },
    scheduledAt: "2026-09-30T00:00:00Z",
    bettingEndsAt: "2026-09-29T23:00:00Z",
    status,
    outcome,
    poolA: "0",
    poolB: "0",
    totalPool: "0",
    oracleAddress: "G1",
    createdBy: "G2",
    resolvedAt: RESOLVED_AT,
  };
}

const winningBet: Bet = {
  id: "b-1",
  marketId: "m-1",
  bettor: "GBETTOR",
  side: "FighterA",
  amount: "100",
  placedAt: "2026-09-29T00:00:00Z",
  claimed: false,
  payout: null,
};

describe("ClaimButton", () => {
  it("renders nothing for a losing bet on a resolved market", () => {
    const { container } = render(
      <ClaimButton bet={{ ...winningBet, side: "FighterB" }} market={makeMarket("Resolved", "FighterA")} onClaimed={jest.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a disabled claim with the reason during the dispute window", () => {
    jest.spyOn(Date, "now").mockReturnValue(RESOLVED_AT_MS + 1000);
    render(<ClaimButton bet={winningBet} market={makeMarket("Resolved", "FighterA")} onClaimed={jest.fn()} />);

    expect(screen.getByRole("button", { name: "Claim Winnings" })).toBeDisabled();
    expect(screen.getByText("Claimable after the dispute window closes.")).toBeInTheDocument();
    jest.restoreAllMocks();
  });

  it("shows a disabled claim with the reason while the result is disputed", () => {
    render(<ClaimButton bet={winningBet} market={makeMarket("Disputed", "FighterA")} onClaimed={jest.fn()} />);

    expect(screen.getByRole("button", { name: "Claim Winnings" })).toBeDisabled();
    expect(screen.getByText(/decided by an admin/)).toBeInTheDocument();
  });

  it("enables the claim once the dispute window has passed", () => {
    jest.spyOn(Date, "now").mockReturnValue(RESOLVED_AT_MS + DAY_MS + 1);
    render(<ClaimButton bet={winningBet} market={makeMarket("Resolved", "FighterA")} onClaimed={jest.fn()} />);

    expect(screen.getByRole("button", { name: "Claim Winnings" })).toBeEnabled();
    expect(screen.queryByText(/dispute window/)).not.toBeInTheDocument();
    jest.restoreAllMocks();
  });

  it("allows refunds on a cancelled market straight away", () => {
    render(<ClaimButton bet={winningBet} market={makeMarket("Cancelled", null)} onClaimed={jest.fn()} />);

    expect(screen.getByRole("button", { name: "Claim Refund" })).toBeEnabled();
  });

  it("shows a claimed bet as claimed", () => {
    render(
      <ClaimButton bet={{ ...winningBet, claimed: true }} market={makeMarket("Resolved", "FighterA")} onClaimed={jest.fn()} />
    );

    expect(screen.getByRole("button", { name: "Claimed" })).toBeDisabled();
  });
});
