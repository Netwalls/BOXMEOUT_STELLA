import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DisputeModal } from "./DisputeModal";
import { Market, Bet } from "@/lib/api";
import { useWallet } from "@/hooks/useWallet";
import { useToast } from "@/components/ToastProvider";
import * as stellar from "@/lib/stellar";

jest.mock("@/hooks/useWallet");
jest.mock("@/components/ToastProvider");
jest.mock("@/lib/stellar");

const mockBet: Bet = {
  id: "b1",
  marketId: "m1",
  bettor: "G_USER",
  side: "FighterA",
  amount: "100",
  placedAt: new Date().toISOString(),
  claimed: false,
  payout: null,
};

const now = Date.now();

const buildMarket = (overrides: Partial<Market> = {}): Market => ({
  id: "m1",
  contractAddress: "CA1",
  fighterA: { name: "Alice", record: "10-0", nationality: "USA", weightClass: "LW" },
  fighterB: { name: "Bob", record: "9-1", nationality: "UK", weightClass: "LW" },
  // scheduledAt acts as resolvedAt proxy; 1 hour ago = within 24h window
  scheduledAt: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
  bettingEndsAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  status: "Resolved",
  outcome: "FighterA",
  poolA: "5000000000",
  poolB: "3000000000",
  totalPool: "8000000000",
  oracleAddress: "ORA1",
  createdBy: "0xabc",
  ...overrides,
});

describe("DisputeModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useWallet as jest.Mock).mockReturnValue({
      address: "G_USER",
      signTransaction: jest.fn().mockResolvedValue("signedXdr"),
      isNetworkMismatched: false,
    });
    (useToast as jest.Mock).mockReturnValue({
      addToast: jest.fn(),
    });
    (stellar.buildSorobanInvocation as jest.Mock).mockResolvedValue("xdr");
    (stellar.submitTransaction as jest.Mock).mockResolvedValue({ txHash: "0x123" });
  });
  it("renders nothing when market is not Resolved", () => {
    const { container } = render(
      <DisputeModal market={buildMarket({ status: "Open" })} isOpen onDisputed={jest.fn()} onClose={jest.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when outside dispute window (resolved > 24h ago)", () => {
    const { container } = render(
      <DisputeModal
        market={buildMarket({ scheduledAt: new Date(now - 25 * 60 * 60 * 1000).toISOString() })}
        isOpen
        onDisputed={jest.fn()}
        onClose={jest.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <DisputeModal market={buildMarket()} isOpen={false} onDisputed={jest.fn()} onClose={jest.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders modal title and textarea when open and within window", () => {
    render(
      <DisputeModal market={buildMarket()} isOpen onDisputed={jest.fn()} onClose={jest.fn()} />
    );
    expect(screen.getByText("Dispute This Result")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("renders in document.body portal", () => {
    render(
      <DisputeModal market={buildMarket()} isOpen onDisputed={jest.fn()} onClose={jest.fn()} />
    );
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
  });

  it("shows validation error when reason is too short", async () => {
    const user = userEvent.setup();
    render(
      <DisputeModal market={buildMarket()} userBets={[mockBet]} isOpen onDisputed={jest.fn()} onClose={jest.fn()} />
    );
    await user.type(screen.getByRole("textbox"), "Too short");
    await user.click(screen.getByRole("button", { name: /Submit Dispute/i }));
    expect(screen.getByText(/at least 20 characters/i)).toBeInTheDocument();
  });

  it("calls onDisputed when reason is valid and form submitted", async () => {
    const user = userEvent.setup();
    const onDisputed = jest.fn();
    render(
      <DisputeModal market={buildMarket()} userBets={[mockBet]} isOpen onDisputed={onDisputed} onClose={jest.fn()} />
    );
    await user.type(screen.getByRole("textbox"), "This is a valid reason with enough characters.");
    await user.click(screen.getByRole("button", { name: /Submit Dispute/i }));
    await waitFor(() => expect(onDisputed).toHaveBeenCalledTimes(1));
  });

  it("closes on backdrop click", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<DisputeModal market={buildMarket()} isOpen onDisputed={jest.fn()} onClose={onClose} />);
    // Click the backdrop overlay (the outermost fixed div)
    const backdrop = document.querySelector(".fixed.inset-0") as HTMLElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape key press", () => {
    const onClose = jest.fn();
    render(<DisputeModal market={buildMarket()} isOpen onDisputed={jest.fn()} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("matches snapshot when open within window", () => {
    jest.useFakeTimers();
    const fixedNow = 1700000000000;
    jest.setSystemTime(fixedNow);
    const market = buildMarket({
      scheduledAt: new Date(fixedNow - (3600 + 1) * 1000).toISOString(),
    });
    const { baseElement } = render(
      <DisputeModal market={market} isOpen onDisputed={jest.fn()} onClose={jest.fn()} />
    );
    expect(document.body.querySelector('[role="dialog"]')).toMatchSnapshot();
    jest.useRealTimers();
  });

  it("matches snapshot when not visible (outside window)", () => {
    const { container } = render(
      <DisputeModal
        market={buildMarket({ scheduledAt: new Date(now - 25 * 60 * 60 * 1000).toISOString() })}
        isOpen
        onDisputed={jest.fn()}
        onClose={jest.fn()}
      />
    );
    expect(container).toMatchSnapshot();
  });
});
