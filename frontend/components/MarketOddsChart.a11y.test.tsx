import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { MarketOddsChart } from "./MarketOddsChart";
import { OddsSnapshot } from "@/lib/api";

expect.extend(toHaveNoViolations);

// Recharts uses ResizeObserver; stub it for jsdom
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const makeSnapshot = (timestamp: string, oddsA: number, oddsB: number): OddsSnapshot => ({
  timestamp,
  poolA: String(oddsA * 1e7),
  poolB: String(oddsB * 1e7),
  oddsA,
  oddsB,
});

const history: OddsSnapshot[] = [
  makeSnapshot("2026-06-26T10:00:00Z", 55, 45),
  makeSnapshot("2026-06-26T11:00:00Z", 60, 40),
  makeSnapshot("2026-06-26T12:00:00Z", 65, 35),
];

describe("MarketOddsChart accessibility", () => {
  it("has no axe violations", async () => {
    const { container } = render(<MarketOddsChart marketId="m1" historicalOdds={history} />);

    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no axe violations with the data table open", async () => {
    const user = userEvent.setup();
    const { container } = render(<MarketOddsChart marketId="m1" historicalOdds={history} />);

    await user.click(screen.getByRole("button", { name: /show data table/i }));

    expect(await axe(container)).toHaveNoViolations();
  });

  it("summarises current odds and change since open as text", () => {
    render(<MarketOddsChart marketId="m1" historicalOdds={history} />);

    expect(
      screen.getByText(
        "Current odds: Fighter A 65%, Fighter B 35%. Change since open: Fighter A +10 points, Fighter B -10 points."
      )
    ).toBeInTheDocument();
  });

  it("reports unchanged odds for a single snapshot", () => {
    render(<MarketOddsChart marketId="m1" historicalOdds={[history[0]]} />);

    expect(screen.getByText(/change since open: fighter a unchanged, fighter b unchanged/i)).toBeInTheDocument();
  });

  it("toggles a data table with one row per snapshot", async () => {
    const user = userEvent.setup();
    render(<MarketOddsChart marketId="m1" historicalOdds={history} />);

    const toggle = screen.getByRole("button", { name: /show data table/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const table = screen.getByRole("table", { name: /odds history/i });
    // Header row plus one row per snapshot
    expect(table.querySelectorAll("tr")).toHaveLength(history.length + 1);

    await user.click(screen.getByRole("button", { name: /hide data table/i }));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
