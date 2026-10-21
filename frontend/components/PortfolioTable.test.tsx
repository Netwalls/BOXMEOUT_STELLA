import { render, screen, fireEvent, within } from "@testing-library/react";
import { PortfolioTable } from "./PortfolioTable";

const mockAddToast = jest.fn();

jest.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

// The real ClaimButton needs wallet hooks; these tests only care about the table.
jest.mock("./ClaimButton", () => ({
  ClaimButton: ({ bet, onClaimed }: { bet: { id: string }; onClaimed: (receipt: unknown) => void }) => (
    <button onClick={() => onClaimed({ betId: bet.id })}>claim-{bet.id}</button>
  ),
}));

const fighter = (name: string) => ({ name, record: "10-0", nationality: "USA", weightClass: "Heavyweight" });

const markets = {
  m1: {
    id: "m1",
    fighterA: fighter("Alpha"),
    fighterB: fighter("Bravo"),
    status: "Open",
    outcome: null,
  },
  m2: {
    id: "m2",
    fighterA: fighter("Charlie"),
    fighterB: fighter("Delta"),
    status: "Resolved",
    outcome: "FighterA",
  },
  m3: {
    id: "m3",
    fighterA: fighter("Echo"),
    fighterB: fighter("Foxtrot"),
    status: "Cancelled",
    outcome: null,
  },
} as never;

const makeBet = (
  id: string,
  marketId: string,
  side: "FighterA" | "FighterB",
  overrides: Partial<{ amount: string; claimed: boolean; placedAt: string }> = {}
) => ({
  id,
  marketId,
  bettor: "GBETTOR",
  side,
  amount: "10000000",
  placedAt: "2026-01-01T00:00:00Z",
  claimed: false,
  payout: null,
  ...overrides,
});

// b1: open, b2: lost, b3: won and claimed, b4: refundable
const bets = [
  makeBet("b1", "m1", "FighterA", { amount: "30000000", placedAt: "2026-01-03T00:00:00Z" }),
  makeBet("b2", "m2", "FighterB", { amount: "20000000", placedAt: "2026-01-02T00:00:00Z" }),
  makeBet("b3", "m2", "FighterA", { amount: "50000000", claimed: true, placedAt: "2026-01-01T00:00:00Z" }),
  makeBet("b4", "m3", "FighterA", { amount: "10000000", placedAt: "2026-01-04T00:00:00Z" }),
];

function dataRows() {
  return screen.getAllByRole("row").slice(1);
}

describe("PortfolioTable", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows an empty state with a link to browse markets", () => {
    render(<PortfolioTable bets={[]} markets={{}} />);

    expect(screen.getByText(/No bets yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse markets" })).toHaveAttribute("href", "/");
  });

  it("lists every bet with its fight name", () => {
    render(<PortfolioTable bets={bets} markets={markets} />);

    expect(dataRows()).toHaveLength(4);
    expect(screen.getByText("Alpha vs Bravo")).toBeInTheDocument();
    expect(screen.getByText("Charlie vs Delta")).toBeInTheDocument();
  });

  it("falls back to the market id when the market is unknown", () => {
    render(<PortfolioTable bets={[makeBet("b9", "unknown-market", "FighterA")]} markets={{}} />);

    expect(screen.getByText("unknown-market")).toBeInTheDocument();
  });

  it("shows Claimed for a claimed bet and Pending for the rest", () => {
    render(<PortfolioTable bets={bets} markets={markets} />);

    expect(screen.getByText("Claimed")).toBeInTheDocument();
    expect(screen.getAllByText("Pending")).toHaveLength(3);
  });

  it("filters to won bets", () => {
    render(<PortfolioTable bets={bets} markets={markets} />);

    fireEvent.click(screen.getByRole("tab", { name: /Won/ }));

    expect(dataRows()).toHaveLength(1);
    expect(screen.getByText("claim-b3")).toBeInTheDocument();
  });

  it("filters to lost bets", () => {
    render(<PortfolioTable bets={bets} markets={markets} />);

    fireEvent.click(screen.getByRole("tab", { name: /Lost/ }));

    expect(dataRows()).toHaveLength(1);
    expect(screen.getByText("claim-b2")).toBeInTheDocument();
  });

  it("filters to refundable bets", () => {
    render(<PortfolioTable bets={bets} markets={markets} />);

    fireEvent.click(screen.getByRole("tab", { name: /Refundable/ }));

    expect(dataRows()).toHaveLength(1);
    expect(screen.getByText("claim-b4")).toBeInTheDocument();
  });

  it("explains an empty filter result", () => {
    render(<PortfolioTable bets={[makeBet("b2", "m2", "FighterB")]} markets={markets} />);

    fireEvent.click(screen.getByRole("tab", { name: /Open/ }));

    expect(screen.getByText(/No bets match the “Open” filter/)).toBeInTheDocument();
  });

  it("sorts by stake ascending on first click and descending on the second", () => {
    render(<PortfolioTable bets={bets} markets={markets} />);
    const stake = screen.getByRole("columnheader", { name: /Stake/ });

    fireEvent.click(stake);
    expect(stake).toHaveTextContent("↑");
    expect(within(dataRows()[0]).getByText("1.00 XLM")).toBeInTheDocument();

    fireEvent.click(stake);
    expect(stake).toHaveTextContent("↓");
    expect(within(dataRows()[0]).getByText("5.00 XLM")).toBeInTheDocument();
  });

  it("toasts and notifies the parent after a successful claim", () => {
    const onClaimSuccess = jest.fn();
    render(<PortfolioTable bets={bets} markets={markets} onClaimSuccess={onClaimSuccess} />);

    fireEvent.click(screen.getByText("claim-b1"));

    expect(mockAddToast).toHaveBeenCalledWith("Bet claimed successfully!", "success");
    expect(onClaimSuccess).toHaveBeenCalledTimes(1);
  });
});
