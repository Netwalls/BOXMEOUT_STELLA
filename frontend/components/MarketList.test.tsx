import React from "react";
import { render, screen } from "@testing-library/react";
import { MarketList } from "./MarketList";
import { Market, MarketStatus } from "@/lib/api";

jest.mock("./MarketCard", () => {
  return function DummyMarketCard({ market }: { market: Market }) {
    return <div data-testid={`market-card-${market.id}`}>{market.fighterA.name}</div>;
  };
});

jest.mock("./LoadingSkeleton", () => ({
  LoadingSkeleton: function DummyLoadingSkeleton({ variant, count }: { variant: string; count?: number }) {
    return <div data-testid="loading-skeleton">{`Loading ${variant} x${count ?? 1}`}</div>;
  },
}));

const buildMarket = (id: string, status: MarketStatus): Market => ({
  id,
  contractAddress: `CA${id}`,
  fighterA: { name: `Fighter A ${id}`, record: "10-0", nationality: "USA", weightClass: "HW" },
  fighterB: { name: `Fighter B ${id}`, record: "9-1", nationality: "USA", weightClass: "HW" },
  scheduledAt: "2026-07-10T20:00:00Z",
  bettingEndsAt: "2026-07-09T20:00:00Z",
  status,
  outcome: null,
  poolA: "1000",
  poolB: "1000",
  totalPool: "2000",
  oracleAddress: "ORA",
  createdBy: "0xabc",
});

describe("MarketList", () => {
  it("renders loading skeleton when isLoading is true", () => {
    render(<MarketList markets={[]} isLoading={true} />);
    expect(screen.getByTestId("loading-skeleton")).toBeInTheDocument();
    expect(screen.getByText(/Loading card x6/)).toBeInTheDocument();
  });

  it("renders empty state when no markets and not loading", () => {
    render(<MarketList markets={[]} isLoading={false} />);
    expect(screen.getByText(/No markets yet/)).toBeInTheDocument();
    expect(screen.getByText("🥊")).toBeInTheDocument();
  });

  it("renders all markets in grid layout", () => {
    const markets = [
      buildMarket("1", "Open"),
      buildMarket("2", "Open"),
      buildMarket("3", "Open"),
    ];
    render(<MarketList markets={markets} isLoading={false} />);

    expect(screen.getByTestId("market-card-1")).toBeInTheDocument();
    expect(screen.getByTestId("market-card-2")).toBeInTheDocument();
    expect(screen.getByTestId("market-card-3")).toBeInTheDocument();
  });

  it("filters markets by status", () => {
    const markets = [
      buildMarket("1", "Open"),
      buildMarket("2", "Locked"),
      buildMarket("3", "Open"),
    ];
    render(<MarketList markets={markets} isLoading={false} filter="Open" />);

    expect(screen.getByTestId("market-card-1")).toBeInTheDocument();
    expect(screen.getByTestId("market-card-3")).toBeInTheDocument();
    expect(screen.queryByTestId("market-card-2")).not.toBeInTheDocument();
  });

  it("shows empty state for filtered results with no matches", () => {
    const markets = [buildMarket("1", "Open")];
    render(<MarketList markets={markets} isLoading={false} filter="Resolved" />);

    expect(screen.getByText(/No resolved markets yet/)).toBeInTheDocument();
  });

  it("uses correct grid layout classes", () => {
    const markets = [buildMarket("1", "Open")];
    const { container } = render(<MarketList markets={markets} isLoading={false} />);

    const grid = container.querySelector(".grid");
    expect(grid).toHaveClass("grid-cols-1", "md:grid-cols-2", "lg:grid-cols-3", "gap-4");
  });

  it("matches snapshot for loading state", () => {
    const { container } = render(<MarketList markets={[]} isLoading={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("matches snapshot for empty state", () => {
    const { container } = render(<MarketList markets={[]} isLoading={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("matches snapshot with data", () => {
    const markets = [
      buildMarket("1", "Open"),
      buildMarket("2", "Open"),
      buildMarket("3", "Open"),
    ];
    const { container } = render(<MarketList markets={markets} isLoading={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
