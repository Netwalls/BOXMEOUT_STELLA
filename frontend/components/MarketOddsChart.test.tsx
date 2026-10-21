import React from "react";
import { render, screen } from "@testing-library/react";
import { MarketOddsChart } from "./MarketOddsChart";
import { OddsSnapshot } from "@/lib/api";

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

describe("MarketOddsChart", () => {
  it("shows placeholder when no data", () => {
    render(<MarketOddsChart marketId="m1" historicalOdds={[]} />);
    expect(screen.getByText("No odds data yet")).toBeInTheDocument();
  });

  it("renders chart container for single data point without crashing", () => {
    const { container } = render(
      <MarketOddsChart
        marketId="m1"
        historicalOdds={[makeSnapshot("2026-06-26T12:00:00Z", 60, 40)]}
      />
    );
    // Chart wrapper div should be present (not the placeholder)
    expect(screen.queryByText("No odds data yet")).not.toBeInTheDocument();
    expect(container.querySelector(".recharts-wrapper, [class*='recharts']") ?? container.firstChild).toBeTruthy();
  });

  it("renders chart container for multiple data points", () => {
    render(
      <MarketOddsChart
        marketId="m1"
        historicalOdds={[
          makeSnapshot("2026-06-26T10:00:00Z", 55, 45),
          makeSnapshot("2026-06-26T11:00:00Z", 60, 40),
          makeSnapshot("2026-06-26T12:00:00Z", 65, 35),
        ]}
      />
    );
    expect(screen.queryByText("No odds data yet")).not.toBeInTheDocument();
  });

  it("matches snapshot for empty state", () => {
    const { container } = render(
      <MarketOddsChart marketId="m1" historicalOdds={[]} />
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("matches snapshot for single data point", () => {
    const { container } = render(
      <MarketOddsChart
        marketId="m1"
        historicalOdds={[makeSnapshot("2026-06-26T12:00:00Z", 60, 40)]}
      />
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("matches snapshot for multiple data points", () => {
    const { container } = render(
      <MarketOddsChart
        marketId="m1"
        historicalOdds={[
          makeSnapshot("2026-06-26T10:00:00Z", 55, 45),
          makeSnapshot("2026-06-26T11:00:00Z", 65, 35),
        ]}
      />
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
