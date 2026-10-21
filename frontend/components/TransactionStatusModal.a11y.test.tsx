import React, { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { TransactionStatusModal, TxStatus } from "./TransactionStatusModal";

expect.extend(toHaveNoViolations);

describe("TransactionStatusModal accessibility", () => {
  it.each<TxStatus>(["pending", "success", "error"])(
    "has no axe violations in %s state",
    async (status) => {
      render(
        <TransactionStatusModal
          isOpen
          status={status}
          txHash={status === "success" ? "abcdef1234567890" : undefined}
          errorMessage={status === "error" ? "Transaction rejected by user" : undefined}
          onClose={jest.fn()}
        />
      );

      const dialog = screen.getByRole("dialog");
      expect(await axe(dialog)).toHaveNoViolations();
    }
  );

  it("announces status changes via aria-live status region", async () => {
    function TestComponent() {
      const [status, setStatus] = useState<TxStatus>("pending");
      return (
        <div>
          <button onClick={() => setStatus("success")}>Mark Success</button>
          <button onClick={() => setStatus("error")}>Mark Error</button>
          <TransactionStatusModal isOpen status={status} onClose={jest.fn()} />
        </div>
      );
    }

    const user = userEvent.setup();
    render(<TestComponent />);

    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toHaveTextContent(/Processing Transaction…/i);

    // Transition to success
    await user.click(screen.getByRole("button", { name: /mark success/i }));
    expect(liveRegion).toHaveTextContent(/Transaction Confirmed/i);

    // Transition to error
    await user.click(screen.getByRole("button", { name: /mark error/i }));
    expect(liveRegion).toHaveTextContent(/Transaction Failed/i);
  });

  it("blocks Escape and announces warning when transaction is mid-flight (pending)", async () => {
    const user = userEvent.setup();
    const handleClose = jest.fn();

    render(
      <TransactionStatusModal
        isOpen
        status="pending"
        onClose={handleClose}
      />
    );

    await user.keyboard("{Escape}");
    expect(handleClose).not.toHaveBeenCalled();

    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toHaveTextContent(/in progress\. Please keep this window open/i);
  });

  it("closes on Escape and restores focus to trigger when dismissable (success/error)", async () => {
    function TestWrapper() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <div>
          <button id="tx-trigger" onClick={() => setIsOpen(true)}>
            Start Tx
          </button>
          <TransactionStatusModal
            isOpen={isOpen}
            status="success"
            txHash="123456"
            onClose={() => setIsOpen(false)}
          />
        </div>
      );
    }

    const user = userEvent.setup();
    render(<TestWrapper />);

    const trigger = screen.getByRole("button", { name: /start tx/i });
    trigger.focus();
    expect(trigger).toHaveFocus();

    await user.click(trigger);

    // Focus moves into the modal dialog
    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    // Press Escape to dismiss
    await user.keyboard("{Escape}");

    // Focus restored to trigger button
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it("traps focus and cycles through focusable elements on Tab in success state", async () => {
    const user = userEvent.setup();
    render(
      <TransactionStatusModal
        isOpen
        status="success"
        txHash="hash123456"
        onClose={jest.fn()}
      />
    );

    const explorerLink = screen.getByRole("link", { name: /view on stellar expert/i });
    const doneButton = screen.getByRole("button", { name: /done/i });

    explorerLink.focus();
    expect(explorerLink).toHaveFocus();

    await user.tab();
    expect(doneButton).toHaveFocus();

    // Tab wraps from last back to first
    await user.tab();
    expect(explorerLink).toHaveFocus();

    // Shift+Tab wraps back to last
    await user.tab({ shift: true });
    expect(doneButton).toHaveFocus();
  });
});
