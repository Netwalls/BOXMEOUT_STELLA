import React from "react";
import { render, screen } from "@testing-library/react";
import { MarketOddsBar } from "./MarketOddsBar";

describe("MarketOddsBar", () => {
  it("displays fighter names and percentages", () => {
    render(
      <MarketOddsBar
        poolA={80n}
        poolB={20n}
        fighterAName="Alice"
        fighterBName="Bob"
      />
    );

    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
  });

  it("shows 50/50 when both pools are zero", () => {
    render(
      <MarketOddsBar
        poolA={0n}
        poolB={0n}
        fighterAName="Alice"
        fighterBName="Bob"
      />
    );

    const text = screen.getByText(/Alice 50%/);
    expect(text).toBeInTheDocument();
    expect(screen.getByText(/50% Bob/)).toBeInTheDocument();
  });

  it("calculates proportions correctly for 80/20 split", () => {
    render(
      <MarketOddsBar
        poolA={8000000000n}
        poolB={2000000000n}
        fighterAName="Alice"
        fighterBName="Bob"
      />
    );

    expect(screen.getByText(/Alice 80%/)).toBeInTheDocument();
    expect(screen.getByText(/20% Bob/)).toBeInTheDocument();
  });

  it("calculates proportions correctly for 50/50 split", () => {
    render(
      <MarketOddsBar
        poolA={5000000000n}
        poolB={5000000000n}
        fighterAName="Alice"
        fighterBName="Bob"
      />
    );

    expect(screen.getByText(/Alice 50%/)).toBeInTheDocument();
    expect(screen.getByText(/50% Bob/)).toBeInTheDocument();
  });

  it("calculates proportions correctly for 100/0 split", () => {
    render(
      <MarketOddsBar
        poolA={10000000000n}
        poolB={0n}
        fighterAName="Alice"
        fighterBName="Bob"
      />
    );

    expect(screen.getByText(/Alice 100%/)).toBeInTheDocument();
    expect(screen.getByText(/0% Bob/)).toBeInTheDocument();
  });

  it("percentages always sum to 100", () => {
    const testCases = [
      { poolA: 333n, poolB: 667n },
      { poolA: 123456n, poolB: 654321n },
      { poolA: 1n, poolB: 99n },
    ];

    testCases.forEach(({ poolA, poolB }) => {
      const { unmount } = render(
        <MarketOddsBar
          poolA={poolA}
          poolB={poolB}
          fighterAName="Alice"
          fighterBName="Bob"
        />
      );

      const text = screen.getByText(/Alice/).textContent || "";
      const allText = screen.getByText(/Bob/).parentElement?.textContent || "";

      // Extract percentages from text like "Alice 33%" and "67% Bob"
      const percentagesMatch = allText.match(/(\d+)%/g);
      if (percentagesMatch && percentagesMatch.length === 2) {
        const pctA = parseInt(percentagesMatch[0]);
        const pctB = parseInt(percentagesMatch[1]);
        expect(pctA + pctB).toBe(100);
      }

      unmount();
    });
  });

  it("renders a horizontal bar with two colored sections", () => {
    const { container } = render(
      <MarketOddsBar
        poolA={8000000000n}
        poolB={2000000000n}
        fighterAName="Alice"
        fighterBName="Bob"
      />
    );

    const bars = container.querySelectorAll("div[style*='width']");
    expect(bars.length).toBeGreaterThanOrEqual(2);
  });

  it("matches the snapshot", () => {
    const { container } = render(
      <MarketOddsBar
        poolA={6000000000n}
        poolB={4000000000n}
        fighterAName="Alice"
        fighterBName="Bob"
      />
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
