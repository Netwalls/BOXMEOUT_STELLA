import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { DisputeModal } from "./DisputeModal";
import { Market } from "@/lib/api";

expect.extend(toHaveNoViolations);

jest.mock("@/hooks/useWallet", () => ({
  useWallet: jest.fn(() => ({
    address: "GBX...",
    isConnected: true,
    walletNotInstalled: false,
    networkPassphrase: null,
    connect: jest.fn(),
    disconnect: jest.fn(),
    signTransaction: jest.fn().mockResolvedValue("signed-xdr"),
  })),
}));

jest.mock("@/components/ToastProvider", () => ({
  useToast: () => ({
    addToast: jest.fn(),
  }),
}));

jest.mock("@/lib/stellar", () => ({
  buildSorobanInvocation: jest.fn().mockResolvedValue("mock-xdr"),
  submitTransaction: jest.fn().mockResolvedValue({ status: "SUCCESS" }),
}));

const now = Date.now();

const buildMarket = (): Market => ({
  id: "m1",
  contractAddress: "CA1",
  fighterA: { name: "Alice", record: "10-0", nationality: "USA", weightClass: "LW" },
  fighterB: { name: "Bob", record: "9-1", nationality: "UK", weightClass: "LW" },
  scheduledAt: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
  bettingEndsAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  status: "Resolved",
  outcome: "FighterA",
  poolA: "5000000000",
  poolB: "3000000000",
  totalPool: "8000000000",
  oracleAddress: "ORA1",
  createdBy: "0xabc",
});

const mockUserBets = [
  { id: "b1", marketId: "m1", user: "GBX...", side: "A" as const, amount: "100", timestamp: now },
];

describe("DisputeModal accessibility", () => {
  it("has no axe violations when open with user bets", async () => {
    render(
      <DisputeModal
        market={buildMarket()}
        userBets={mockUserBets}
        isOpen
        onDisputed={jest.fn()}
        onClose={jest.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(await axe(dialog)).toHaveNoViolations();
  });

  it("moves focus into the dialog on open and returns focus to trigger on close", async () => {
    function TestWrapper() {
      const [isOpen, setIsOpen] = React.useState(false);
      return (
        <div>
          <button id="open-btn" onClick={() => setIsOpen(true)}>
            Open Dispute
          </button>
          <DisputeModal
            market={buildMarket()}
            userBets={mockUserBets}
            isOpen={isOpen}
            onDisputed={jest.fn()}
            onClose={() => setIsOpen(false)}
          />
        </div>
      );
    }

    const user = userEvent.setup();
    render(<TestWrapper />);

    const openBtn = screen.getByRole("button", { name: /open dispute/i });
    openBtn.focus();
    expect(openBtn).toHaveFocus();

    await user.click(openBtn);

    // Focus moves into the dialog (e.g. textarea)
    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    // Close via Cancel button
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelBtn);

    // Focus restored to trigger
    await waitFor(() => {
      expect(openBtn).toHaveFocus();
    });
  });

  it("traps focus and cycles through focusable elements on Tab", async () => {
    const user = userEvent.setup();
    render(
      <DisputeModal
        market={buildMarket()}
        userBets={mockUserBets}
        isOpen
        onDisputed={jest.fn()}
        onClose={jest.fn()}
      />
    );

    const textarea = screen.getByRole("textbox");
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    const submitBtn = screen.getByRole("button", { name: /submit dispute/i });

    // Focus starts inside dialog
    textarea.focus();
    expect(textarea).toHaveFocus();

    // Tab to Cancel
    await user.tab();
    expect(cancelBtn).toHaveFocus();

    // Tab to Submit button
    await user.tab();
    expect(submitBtn).toHaveFocus();

    // Tab wraps from last focusable element back to first (textarea)
    await user.tab();
    expect(textarea).toHaveFocus();

    // Shift+Tab wraps back to last focusable element (submitBtn)
    await user.tab({ shift: true });
    expect(submitBtn).toHaveFocus();
  });

  it("closes on Escape key press when not submitting", async () => {
    const user = userEvent.setup();
    const handleClose = jest.fn();

    render(
      <DisputeModal
        market={buildMarket()}
        userBets={mockUserBets}
        isOpen
        onDisputed={jest.fn()}
        onClose={handleClose}
      />
    );

    await user.keyboard("{Escape}");
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
