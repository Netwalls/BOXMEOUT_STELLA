import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import MarketCard from "./MarketCard";
import { Market, MarketStatus } from "@/lib/api";

expect.extend(toHaveNoViolations);

const buildMarket = (status: MarketStatus): Market => ({
  id: "market-123",
  contractAddress: "CA1",
  fighterA: { name: "Maya Chen", record: "19-1", nationality: "USA", weightClass: "Lightweight" },
  fighterB: { name: "Rico Alvarez", record: "20-2", nationality: "Mexico", weightClass: "Lightweight" },
  scheduledAt: "2026-07-10T20:00:00Z",
  bettingEndsAt: "2026-07-09T20:00:00Z",
  status,
  outcome: null,
  poolA: "1200",
  poolB: "900",
  totalPool: "2100",
  oracleAddress: "ORA",
  createdBy: "GCREATOR",
});

describe("MarketCard accessibility", () => {
  it("has no axe violations without odds", async () => {
    const { container } = render(<MarketCard market={buildMarket("Open")} showOdds={false} />);

    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no axe violations with the odds bar rendered", async () => {
    const { container } = render(<MarketCard market={buildMarket("Open")} showOdds />);

    expect(await axe(container)).toHaveNoViolations();
  });

  it.each<[MarketStatus]>([["Open"], ["Locked"], ["Resolved"], ["Cancelled"], ["Disputed"]])(
    "has no axe violations for the %s status",
    async (status) => {
      const { container } = render(<MarketCard market={buildMarket(status)} showOdds />);

      expect(await axe(container)).toHaveNoViolations();
    }
  );

  it("gives the card link an accessible name covering both fighters and the status", () => {
    render(<MarketCard market={buildMarket("Open")} showOdds={false} />);

    expect(
      screen.getByRole("link", { name: /maya chen versus rico alvarez, open/i })
    ).toHaveAttribute("href", "/markets/market-123");
  });

  it("is reachable by keyboard as a single tab stop", async () => {
    const user = userEvent.setup();
    render(<MarketCard market={buildMarket("Open")} showOdds />);

    await user.tab();

    expect(screen.getByRole("link", { name: /maya chen versus rico alvarez/i })).toHaveFocus();

    // The odds bar must not add a second tab stop inside the card
    await user.tab();
    expect(screen.getByRole("link", { name: /maya chen versus rico alvarez/i })).not.toHaveFocus();
  });

  it("exposes the odds split as text rather than colour alone", () => {
    render(<MarketCard market={buildMarket("Open")} showOdds />);

    expect(screen.getByRole("img", { name: /odds split/i })).toBeInTheDocument();
  });
});
