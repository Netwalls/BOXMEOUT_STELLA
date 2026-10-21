import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BetRow } from "./BetRow";
import { useClaimWinnings } from "@/hooks/useClaimWinnings";

jest.mock("@/hooks/useClaimWinnings");

const mockUseClaimWinnings = useClaimWinnings as jest.Mock;
const mockClaim = jest.fn();

const fighter = (name: string) => ({ name, record: "10-0", nationality: "USA", weightClass: "Heavyweight" });

const makeMarket = (overrides: Partial<{ status: string; outcome: string | null }> = {}) => ({
  id: "market-1",
  contractAddress: "market-1",
  fighterA: fighter("Alpha"),
  fighterB: fighter("Bravo"),
  scheduledAt: "2026-01-01T00:00:00Z",
  bettingEndsAt: "2026-01-01T00:00:00Z",
  status: "Resolved",
  outcome: "FighterA",
  poolA: "0",
  poolB: "0",
  totalPool: "0",
  oracleAddress: "GORACLE",
  createdBy: "GCREATOR",
  ...overrides,
});

const makeBet = (overrides: Partial<{ side: "FighterA" | "FighterB"; claimed: boolean; payout: string | null }> = {}) => ({
  id: "bet-1",
  marketId: "market-1",
  bettor: "GBETTOR",
  side: "FighterA" as const,
  amount: "20000000",
  placedAt: "2026-01-01T00:00:00Z",
  claimed: false,
  payout: null,
  ...overrides,
});

function renderRow(bet: ReturnType<typeof makeBet>, market: ReturnType<typeof makeMarket> | undefined, onClaimed?: jest.Mock) {
  return render(
    <table>
      <tbody>
        <BetRow bet={bet} market={market as never} onClaimed={onClaimed} />
      </tbody>
    </table>
  );
}

describe("BetRow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseClaimWinnings.mockReturnValue({ claim: mockClaim, isLoading: false, error: null });
  });

  it("shows Open for a bet on an open market, with no action", () => {
    renderRow(makeBet(), makeMarket({ status: "Open", outcome: null }));

    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers Claim Winnings for an unclaimed winning bet", () => {
    renderRow(makeBet(), makeMarket());

    expect(screen.getByText("Claimable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claim Winnings" })).toBeEnabled();
  });

  it("shows Won and a disabled Claimed button for a claimed winning bet", () => {
    renderRow(makeBet({ claimed: true }), makeMarket());

    expect(screen.getByText("Won")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claimed" })).toBeDisabled();
  });

  it("shows Lost and no action for a losing bet", () => {
    renderRow(makeBet({ side: "FighterB" }), makeMarket());

    expect(screen.getByText("Lost")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers Claim Refund for an unclaimed bet on a cancelled market", () => {
    renderRow(makeBet(), makeMarket({ status: "Cancelled", outcome: null }));

    expect(screen.getByText("Claimable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claim Refund" })).toBeEnabled();
  });

  it("shows Refunded for a claimed bet on a cancelled market", () => {
    renderRow(makeBet({ claimed: true }), makeMarket({ status: "Cancelled", outcome: null }));

    expect(screen.getByText("Refunded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claimed" })).toBeDisabled();
  });

  it("shows an unknown badge and the market id when the market is missing", () => {
    renderRow(makeBet(), undefined);

    // Status badge and payout cell both show the dash.
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByText("market-1")).toBeInTheDocument();
  });

  it("formats the stake and the payout in XLM", () => {
    renderRow(makeBet({ claimed: true, payout: "30000000" }), makeMarket());

    expect(screen.getByText("2.00 XLM")).toBeInTheDocument();
    expect(screen.getByText("3.00 XLM")).toBeInTheDocument();
  });

  it("claims, reports the receipt and switches to Claimed", async () => {
    const onClaimed = jest.fn();
    const receipt = { betId: "bet-1", bettor: "GBETTOR", payout: BigInt(30000000), claimedAt: "now" };
    mockClaim.mockResolvedValue(receipt);
    renderRow(makeBet(), makeMarket(), onClaimed);

    fireEvent.click(screen.getByRole("button", { name: "Claim Winnings" }));

    await waitFor(() => expect(onClaimed).toHaveBeenCalledWith(receipt));
    expect(mockClaim).toHaveBeenCalledWith("bet-1", "market-1");
    expect(screen.getByRole("button", { name: "Claimed" })).toBeDisabled();
  });

  it("keeps the claim button available when the claim fails", async () => {
    const onClaimed = jest.fn();
    mockClaim.mockRejectedValue(new Error("tx_failed"));
    renderRow(makeBet(), makeMarket(), onClaimed);

    fireEvent.click(screen.getByRole("button", { name: "Claim Winnings" }));

    await waitFor(() => expect(mockClaim).toHaveBeenCalled());
    expect(onClaimed).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Claim Winnings" })).toBeEnabled();
  });
});
