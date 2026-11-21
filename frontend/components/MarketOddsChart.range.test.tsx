import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarketOddsChart } from "./MarketOddsChart";
import type { OddsSnapshot } from "@/lib/api";

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const HOUR = 60 * 60 * 1000;

const snap = (msBefore: number, oddsA: number): OddsSnapshot => ({
  timestamp: new Date(Date.now() - msBefore).toISOString(),
  poolA: "1",
  poolB: "1",
  oddsA,
  oddsB: 100 - oddsA,
});

const LONG_HISTORY = [snap(10 * 24 * HOUR, 40), snap(3 * 24 * HOUR, 45), snap(2 * HOUR, 55), snap(10 * 60 * 1000, 60)];
// Nothing in the last 24 hours, so 1H and 24H have no points.
const STALE_HISTORY = [snap(3 * 24 * HOUR, 45), snap(2 * 24 * HOUR, 50)];

function radio(name: string) {
  return screen.getByRole("radio", { name: new RegExp(`^${name}`) }) as HTMLInputElement;
}

beforeEach(() => {
  window.history.replaceState(null, "", "/markets/m1");
});

describe("MarketOddsChart timeframe selector", () => {
  it("renders the four timeframes as an accessible radio group, defaulting to All", () => {
    render(<MarketOddsChart marketId="m1" historicalOdds={LONG_HISTORY} />);
    expect(screen.getByRole("radiogroup", { name: /odds timeframe/i })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(radio("ALL")).toBeChecked();
  });

  it("disables timeframes that would contain no points", () => {
    render(<MarketOddsChart marketId="m1" historicalOdds={STALE_HISTORY} />);
    expect(radio("1H")).toBeDisabled();
    expect(radio("24H")).toBeDisabled();
    expect(radio("7D")).toBeEnabled();
  });

  it("keeps every timeframe enabled when the market has recent history", () => {
    render(<MarketOddsChart marketId="m1" historicalOdds={LONG_HISTORY} />);
    expect(radio("1H")).toBeEnabled();
    expect(radio("24H")).toBeEnabled();
  });

  it("updates the summary and the URL when a range is chosen", async () => {
    const user = userEvent.setup();
    render(<MarketOddsChart marketId="m1" historicalOdds={LONG_HISTORY} />);
    await user.click(screen.getByText("7D"));
    expect(radio("7D")).toBeChecked();
    expect(screen.getByText(/showing the last 7 days/i)).toBeInTheDocument();
    expect(window.location.search).toContain("oddsRange=7D");
  });

  it("removes the URL parameter when switching back to All", async () => {
    const user = userEvent.setup();
    render(<MarketOddsChart marketId="m1" historicalOdds={LONG_HISTORY} />);
    await user.click(screen.getByText("7D"));
    await user.click(screen.getByText("ALL"));
    expect(window.location.search).not.toContain("oddsRange");
    expect(screen.queryByText(/showing the last/i)).not.toBeInTheDocument();
  });

  it("restores the range from the URL on load", async () => {
    window.history.replaceState(null, "", "/markets/m1?oddsRange=7D");
    render(<MarketOddsChart marketId="m1" historicalOdds={LONG_HISTORY} />);
    await waitFor(() => expect(radio("7D")).toBeChecked());
    expect(screen.getByText(/showing the last 7 days/i)).toBeInTheDocument();
  });

  it("ignores an unknown range in the URL", async () => {
    window.history.replaceState(null, "", "/markets/m1?oddsRange=1Y");
    render(<MarketOddsChart marketId="m1" historicalOdds={LONG_HISTORY} />);
    await waitFor(() => expect(radio("ALL")).toBeChecked());
  });

  it("falls back to All when the URL asks for a range with no data", async () => {
    window.history.replaceState(null, "", "/markets/m1?oddsRange=1H");
    render(<MarketOddsChart marketId="m1" historicalOdds={STALE_HISTORY} />);
    await waitFor(() => expect(radio("ALL")).toBeChecked());
    expect(radio("1H")).toBeDisabled();
  });
});
