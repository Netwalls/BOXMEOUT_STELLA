import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { BetForm } from "./BetForm";
import { usePlaceBet } from "@/hooks/usePlaceBet";

jest.mock("@/hooks/usePlaceBet");

const mockUsePlaceBet = usePlaceBet as jest.Mock;
const mockPlaceBet = jest.fn();

const fighter = (name: string) => ({ name, record: "10-0", nationality: "USA", weightClass: "Heavyweight" });

const market = {
  id: "market-1",
  contractAddress: "market-1",
  fighterA: fighter("Alpha"),
  fighterB: fighter("Bravo"),
  scheduledAt: "2026-01-01T00:00:00Z",
  bettingEndsAt: "2026-01-01T00:00:00Z",
  status: "Open" as const,
  outcome: null,
  poolA: "0",
  poolB: "0",
  totalPool: "0",
  oracleAddress: "GORACLE",
  createdBy: "GCREATOR",
};

const placedBet = {
  id: "tx-1",
  marketId: "market-1",
  bettor: "GBETTOR",
  side: "FighterA" as const,
  amount: "25000000",
  placedAt: "2026-01-01T00:00:00Z",
  claimed: false,
  payout: null,
};

describe("BetForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePlaceBet.mockReturnValue({ placeBet: mockPlaceBet, isLoading: false, error: null });
  });

  it("keeps Confirm disabled until a side and a valid amount are chosen", () => {
    render(<BetForm market={market} />);
    const confirm = screen.getByRole("button", { name: "Confirm Bet" });
    expect(confirm).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Bet on Alpha" }));
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Amount (XLM)"), { target: { value: "5" } });
    expect(confirm).toBeEnabled();
  });

  it("marks the chosen side as pressed", () => {
    render(<BetForm market={market} />);
    const alpha = screen.getByRole("button", { name: "Bet on Alpha" });
    const bravo = screen.getByRole("button", { name: "Bet on Bravo" });

    fireEvent.click(bravo);
    expect(bravo).toHaveAttribute("aria-pressed", "true");
    expect(alpha).toHaveAttribute("aria-pressed", "false");
  });

  it("locks the form and explains why for a market that is not open", () => {
    render(<BetForm market={{ ...market, status: "Locked" }} />);

    expect(screen.getByRole("status")).toHaveTextContent("Betting is locked.");
    expect(screen.getByRole("button", { name: "Bet on Alpha" })).toBeDisabled();
    expect(screen.getByLabelText("Amount (XLM)")).toBeDisabled();
  });

  it("rejects amounts below the minimum and shows no fee breakdown", () => {
    render(<BetForm market={market} />);
    fireEvent.click(screen.getByRole("button", { name: "Bet on Alpha" }));
    fireEvent.change(screen.getByLabelText("Amount (XLM)"), { target: { value: "0.5" } });

    expect(screen.getByRole("button", { name: "Confirm Bet" })).toBeDisabled();
    expect(screen.queryByText("Network fee")).not.toBeInTheDocument();
  });

  it("shows the fee breakdown once the estimate has settled", () => {
    jest.useFakeTimers();
    try {
      const { container } = render(<BetForm market={market} />);
      fireEvent.change(screen.getByLabelText("Amount (XLM)"), { target: { value: "10" } });
      expect(screen.getAllByText("Estimating…")).toHaveLength(3);

      act(() => {
        jest.advanceTimersByTime(400);
      });
      const breakdown = container.querySelector("dl") as HTMLElement;
      expect(within(breakdown).getByText("0.0000200 XLM")).toBeInTheDocument();
      expect(within(breakdown).getByText("0.2000000 XLM")).toBeInTheDocument();
      expect(within(breakdown).getByText("9.8000000 XLM")).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it("places the bet with the stake in stroops and reports success", async () => {
    const onBetPlaced = jest.fn();
    mockPlaceBet.mockResolvedValue(placedBet);
    render(<BetForm market={market} onBetPlaced={onBetPlaced} />);

    fireEvent.click(screen.getByRole("button", { name: "Bet on Alpha" }));
    fireEvent.change(screen.getByLabelText("Amount (XLM)"), { target: { value: "2.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Bet" }));

    expect(mockPlaceBet).toHaveBeenCalledWith("FighterA", BigInt(25000000));
    await waitFor(() => expect(screen.getByText("Transaction Confirmed")).toBeInTheDocument());
    expect(onBetPlaced).toHaveBeenCalledWith(placedBet);
    expect(screen.getByRole("link", { name: /View on Stellar Expert/ })).toHaveAttribute(
      "href",
      expect.stringContaining("/tx-1")
    );
    expect(screen.getByLabelText("Amount (XLM)")).toHaveValue(null);
  });

  it("shows the failure message in the modal when the transaction fails", async () => {
    mockPlaceBet.mockRejectedValue(new Error("User declined the signature"));
    render(<BetForm market={market} />);

    fireEvent.click(screen.getByRole("button", { name: "Bet on Bravo" }));
    fireEvent.change(screen.getByLabelText("Amount (XLM)"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Bet" }));

    await waitFor(() =>
      expect(screen.getByText("User declined the signature")).toBeInTheDocument()
    );
    expect(screen.getByText("Transaction Failed")).toBeInTheDocument();
  });
});
