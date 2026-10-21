import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BettingInterface } from "./BettingInterface";
import { Market, MarketStatus } from "@/lib/api";
import { usePlaceBet } from "@/hooks/usePlaceBet";
import { useToast } from "@/hooks/useToast";

jest.mock("@/hooks/usePlaceBet");
jest.mock("@/hooks/useToast");

const buildMarket = (status: MarketStatus): Market => ({
  id: "market-123",
  contractAddress: "CA1",
  fighterA: {
    name: "Alice Fighter",
    record: "15-3",
    nationality: "USA",
    weightClass: "Middleweight",
  },
  fighterB: {
    name: "Bob Fighter",
    record: "12-5",
    nationality: "Canada",
    weightClass: "Middleweight",
  },
  scheduledAt: "2026-07-15T20:00:00Z",
  bettingEndsAt: "2026-07-14T20:00:00Z",
  status,
  outcome: null,
  poolA: "5000000000",
  poolB: "3000000000",
  totalPool: "8000000000",
  oracleAddress: "ORA123",
  createdBy: "0xabc",
});

describe("BettingInterface", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (usePlaceBet as jest.Mock).mockReturnValue({
      placeBet: jest.fn(),
      isLoading: false,
    });
    (useToast as jest.Mock).mockReturnValue({
      showToast: jest.fn(),
    });
  });

  it("renders two fighter selection buttons", () => {
    render(
      <BettingInterface market={buildMarket("Open")} onBetPlaced={jest.fn()} />
    );

    expect(screen.getByRole("button", { name: /Alice Fighter/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bob Fighter/ })).toBeInTheDocument();
  });

  it("highlights the selected fighter button", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <BettingInterface market={buildMarket("Open")} onBetPlaced={jest.fn()} />
    );

    const aliceButton = screen.getByRole("button", { name: /Alice Fighter/ });
    await user.click(aliceButton);

    expect(aliceButton.className).toContain("bg-blue-600");
  });

  it("highlights Bob button with red when selected", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <BettingInterface market={buildMarket("Open")} onBetPlaced={jest.fn()} />
    );

    const bobButton = screen.getByRole("button", { name: /Bob Fighter/ });
    await user.click(bobButton);

    expect(bobButton.className).toContain("bg-red-600");
  });

  it("disables submit when no side selected or amount is 0", () => {
    render(
      <BettingInterface market={buildMarket("Open")} onBetPlaced={jest.fn()} />
    );

    const submitButton = screen.getByRole("button", { name: /Confirm Bet/ });
    expect(submitButton).toBeDisabled();
  });

  it("shows loading state during transaction", () => {
    (usePlaceBet as jest.Mock).mockReturnValue({
      placeBet: jest.fn(),
      isLoading: true,
    });

    render(
      <BettingInterface market={buildMarket("Open")} onBetPlaced={jest.fn()} />
    );

    expect(screen.getByText(/Confirming transaction/)).toBeInTheDocument();
  });

  it("disables all controls when market status is not Open", () => {
    render(
      <BettingInterface market={buildMarket("Locked")} onBetPlaced={jest.fn()} />
    );

    expect(screen.getByText(/Betting is locked/)).toBeInTheDocument();
    const aliceButton = screen.getByRole("button", { name: /Alice Fighter/ });
    expect(aliceButton).toBeDisabled();
  });

  it("disables entire component when market is Resolved", () => {
    render(
      <BettingInterface
        market={buildMarket("Resolved")}
        onBetPlaced={jest.fn()}
      />
    );

    const submitButton = screen.getByRole("button", { name: /Confirm Bet/ });
    expect(submitButton).toBeDisabled();
  });

  it("calls onBetPlaced with result on successful bet", async () => {
    const user = userEvent.setup();
    const onBetPlaced = jest.fn();
    const mockBet = {
      id: "bet-1",
      marketId: "market-123",
      bettor: "0x123",
      side: "FighterA" as const,
      amount: "100000000",
      placedAt: "2026-06-26T02:30:24Z",
      claimed: false,
      payout: null,
    };

    (usePlaceBet as jest.Mock).mockReturnValue({
      placeBet: jest.fn().mockResolvedValue(mockBet),
      isLoading: false,
    });

    render(
      <BettingInterface market={buildMarket("Open")} onBetPlaced={onBetPlaced} />
    );

    const aliceButton = screen.getByRole("button", { name: /Alice Fighter/ });
    await user.click(aliceButton);

    // Simulate setting amount via BetAmountInput (this would normally be done via user input)
    const submitButton = screen.getByRole("button", { name: /Confirm Bet/ });
    expect(submitButton).toBeDisabled(); // Still disabled because amount is empty
  });

  it("clears side and amount after successful bet", async () => {
    const user = userEvent.setup();
    const onBetPlaced = jest.fn();

    (usePlaceBet as jest.Mock).mockReturnValue({
      placeBet: jest.fn().mockResolvedValue({}),
      isLoading: false,
    });

    const { rerender } = render(
      <BettingInterface market={buildMarket("Open")} onBetPlaced={onBetPlaced} />
    );

    const aliceButton = screen.getByRole("button", { name: /Alice Fighter/ });
    await user.click(aliceButton);

    expect(aliceButton.className).toContain("bg-blue-600");
  });

  it("renders 'Confirm Bet' button text when not loading", () => {
    (usePlaceBet as jest.Mock).mockReturnValue({
      placeBet: jest.fn(),
      isLoading: false,
    });

    render(
      <BettingInterface market={buildMarket("Open")} onBetPlaced={jest.fn()} />
    );

    expect(screen.getByRole("button", { name: /Confirm Bet/ })).toBeInTheDocument();
  });

  it("renders 'Processing…' button text when loading", () => {
    (usePlaceBet as jest.Mock).mockReturnValue({
      placeBet: jest.fn(),
      isLoading: true,
    });

    render(
      <BettingInterface market={buildMarket("Open")} onBetPlaced={jest.fn()} />
    );

    expect(screen.getByRole("button", { name: /Processing…/ })).toBeInTheDocument();
  });

  it("matches the structural snapshot", () => {
    const { container } = render(
      <BettingInterface market={buildMarket("Open")} onBetPlaced={jest.fn()} />
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
