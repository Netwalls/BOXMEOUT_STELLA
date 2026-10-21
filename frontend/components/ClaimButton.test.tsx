import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ClaimButton } from "./ClaimButton";
import { useClaimWinnings } from "@/hooks/useClaimWinnings";
import { useClaimRefund } from "@/hooks/useClaimRefund";

jest.mock("@/hooks/useClaimWinnings");
jest.mock("@/hooks/useClaimRefund");

const mockUseClaimWinnings = useClaimWinnings as jest.Mock;
const mockUseClaimRefund = useClaimRefund as jest.Mock;
const mockClaim = jest.fn();
const mockClaimRefund = jest.fn();

const fighter = (name: string) => ({ name, record: "10-0", nationality: "USA", weightClass: "Heavyweight" });

const makeMarket = (overrides: Partial<{ status: string; outcome: string | null }> = {}) =>
  ({
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
  }) as never;

const makeBet = (overrides: Partial<{ side: "FighterA" | "FighterB"; claimed: boolean }> = {}) => ({
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

describe("ClaimButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseClaimWinnings.mockReturnValue({ claim: mockClaim, isLoading: false, error: null });
    mockUseClaimRefund.mockReturnValue({ claimRefund: mockClaimRefund, isLoading: false, error: null });
  });

  it("renders nothing without market data", () => {
    const { container } = render(<ClaimButton bet={makeBet()} market={undefined} onClaimed={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a disabled Claimed button for a bet already claimed", () => {
    render(<ClaimButton bet={makeBet({ claimed: true })} market={makeMarket()} onClaimed={jest.fn()} />);

    expect(screen.getByRole("button", { name: "Claimed" })).toBeDisabled();
  });

  it("offers Claim Winnings to the winning side of a resolved market", () => {
    render(<ClaimButton bet={makeBet()} market={makeMarket()} onClaimed={jest.fn()} />);

    expect(screen.getByRole("button", { name: "Claim Winnings" })).toBeEnabled();
  });

  it("renders nothing for the losing side of a resolved market", () => {
    const { container } = render(
      <ClaimButton bet={makeBet({ side: "FighterB" })} market={makeMarket()} onClaimed={jest.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers Claim Refund on a cancelled market", () => {
    render(
      <ClaimButton bet={makeBet()} market={makeMarket({ status: "Cancelled", outcome: null })} onClaimed={jest.fn()} />
    );

    expect(screen.getByRole("button", { name: "Claim Refund" })).toBeEnabled();
  });

  it("offers Claim Refund on a no-contest resolution", () => {
    render(
      <ClaimButton bet={makeBet()} market={makeMarket({ status: "Resolved", outcome: "NoContest" })} onClaimed={jest.fn()} />
    );

    expect(screen.getByRole("button", { name: "Claim Refund" })).toBeEnabled();
  });

  it("claims winnings and reports the receipt", async () => {
    const onClaimed = jest.fn();
    const receipt = { betId: "bet-1", bettor: "GBETTOR", payout: BigInt(1), claimedAt: "now" };
    mockClaim.mockResolvedValue(receipt);
    render(<ClaimButton bet={makeBet()} market={makeMarket()} onClaimed={onClaimed} />);

    fireEvent.click(screen.getByRole("button", { name: "Claim Winnings" }));

    await waitFor(() => expect(onClaimed).toHaveBeenCalledWith(receipt));
    expect(mockClaim).toHaveBeenCalledWith("bet-1", "market-1");
    expect(mockClaimRefund).not.toHaveBeenCalled();
  });

  it("uses the refund path on a cancelled market", async () => {
    const onClaimed = jest.fn();
    mockClaimRefund.mockResolvedValue({ betId: "bet-1" });
    render(
      <ClaimButton bet={makeBet()} market={makeMarket({ status: "Cancelled", outcome: null })} onClaimed={onClaimed} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Claim Refund" }));

    await waitFor(() => expect(onClaimed).toHaveBeenCalled());
    expect(mockClaimRefund).toHaveBeenCalledWith("bet-1", "market-1");
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("disables the button while the claim is in flight", () => {
    mockClaim.mockReturnValue(new Promise(() => {}));
    render(<ClaimButton bet={makeBet()} market={makeMarket()} onClaimed={jest.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Claim Winnings" }));

    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("re-enables the button and does not report success when the claim fails", async () => {
    const onClaimed = jest.fn();
    mockClaim.mockRejectedValue(new Error("tx_failed"));
    render(<ClaimButton bet={makeBet()} market={makeMarket()} onClaimed={onClaimed} />);

    fireEvent.click(screen.getByRole("button", { name: "Claim Winnings" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Claim Winnings" })).toBeEnabled());
    expect(onClaimed).not.toHaveBeenCalled();
  });
});
