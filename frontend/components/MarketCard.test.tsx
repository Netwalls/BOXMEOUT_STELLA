import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MarketCard from "./MarketCard";
import { Market, MarketStatus } from "@/lib/api";

const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const buildMarket = (status: MarketStatus): Market => ({
  id: "market-123",
  contractAddress: "CA1",
  fighterA: {
    name: "Maya Chen",
    record: "19-1",
    nationality: "USA",
    weightClass: "Lightweight",
  },
  fighterB: {
    name: "Rico Alvarez",
    record: "20-2",
    nationality: "Mexico",
    weightClass: "Lightweight",
  },
  scheduledAt: "2026-07-10T20:00:00Z",
  bettingEndsAt: "2026-07-09T20:00:00Z",
  status,
  outcome: null,
  poolA: "1200",
  poolB: "900",
  totalPool: "2100",
  oracleAddress: "ORA",
  createdBy: "0xabc",
});

describe("MarketCard", () => {
  beforeEach(() => {
    push.mockReset();
  });

  it("renders competitor names clearly", () => {
    render(<MarketCard market={buildMarket("Open")} showOdds={false} />);

    expect(screen.getAllByText(/Maya Chen/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rico Alvarez/).length).toBeGreaterThan(0);
  });

  it("matches the baseline snapshot", () => {
    const { container } = render(<MarketCard market={buildMarket("Open")} showOdds={false} />);

    expect(container.firstChild).toMatchSnapshot();
  });

  it("navigates to the market detail route when clicked", async () => {
    render(<MarketCard market={buildMarket("Open")} showOdds={false} />);

    const link = screen.getByRole("link", { name: /maya chen versus rico alvarez/i });
    expect(link).toHaveAttribute("href", "/markets/market-123");
  });

  it.each<[MarketStatus]>([
    ["Open"],
    ["Locked"],
    ["Resolved"],
    ["Cancelled"],
    ["Disputed"],
  ])("renders the status badge for %s", (status) => {
    render(<MarketCard market={buildMarket(status)} showOdds={false} />);

    expect(screen.getByText(status)).toBeInTheDocument();
  });
});
