import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransactionStatusModal, humanizeError } from "./TransactionStatusModal";

describe("TransactionStatusModal unit tests", () => {
  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <TransactionStatusModal isOpen={false} status="pending" onClose={jest.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders pending state with spinner and custom title", () => {
    render(
      <TransactionStatusModal
        isOpen
        status="pending"
        title="Custom Pending Title"
        onClose={jest.fn()}
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Custom Pending Title")).toBeInTheDocument();
    expect(screen.getAllByText(/Please keep this window open/i).length).toBeGreaterThanOrEqual(1);
    // No dismiss button in pending state
    expect(screen.queryByRole("button", { name: /done|dismiss/i })).not.toBeInTheDocument();
  });

  it("renders success state with Done button and explorer link", () => {
    render(
      <TransactionStatusModal
        isOpen
        status="success"
        txHash="7a8b9c"
        explorerBaseUrl="https://custom.explorer/tx"
        onClose={jest.fn()}
      />
    );

    expect(screen.getByText("Transaction Confirmed")).toBeInTheDocument();
    const explorerLink = screen.getByRole("link", { name: /view on stellar expert/i });
    expect(explorerLink).toHaveAttribute("href", "https://custom.explorer/tx/7a8b9c");
    expect(screen.getByRole("button", { name: /done/i })).toBeInTheDocument();
  });

  it("renders error state with Dismiss button and humanized error message", () => {
    render(
      <TransactionStatusModal
        isOpen
        status="error"
        errorMessage="Account does not exist on testnet."
        onClose={jest.fn()}
      />
    );

    expect(screen.getByText("Transaction Failed")).toBeInTheDocument();
    expect(screen.getByText("Account does not exist on testnet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dismiss/i })).toBeInTheDocument();
  });

  it("triggers onClose when clicking Done or Dismiss button", async () => {
    const user = userEvent.setup();
    const handleClose = jest.fn();

    const { rerender } = render(
      <TransactionStatusModal isOpen status="success" onClose={handleClose} />
    );

    await user.click(screen.getByRole("button", { name: /done/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);

    rerender(<TransactionStatusModal isOpen status="error" onClose={handleClose} />);
    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(handleClose).toHaveBeenCalledTimes(2);
  });

  it("triggers onClose on backdrop click only when dismissable", async () => {
    const user = userEvent.setup();
    const handleClose = jest.fn();

    const { rerender } = render(
      <TransactionStatusModal isOpen status="pending" onClose={handleClose} />
    );

    // Backdrop click during pending does not dismiss
    const backdrop = document.querySelector(".fixed.inset-0") as HTMLElement;
    await user.click(backdrop);
    expect(handleClose).not.toHaveBeenCalled();

    // Backdrop click during success dismisses
    rerender(<TransactionStatusModal isOpen status="success" onClose={handleClose} />);
    await user.click(backdrop);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  describe("humanizeError helper", () => {
    it("handles null and undefined with default fallback", () => {
      expect(humanizeError(null)).toBe("An unexpected error occurred. Please try again.");
      expect(humanizeError(undefined)).toBe("An unexpected error occurred. Please try again.");
    });

    it("extracts first line from Error objects and strings", () => {
      expect(humanizeError(new Error("User cancelled signature\nat line 45"))).toBe("User cancelled signature");
      expect(humanizeError("Insufficient balance for fee\nExtra details")).toBe("Insufficient balance for fee");
    });

    it("sanitizes long technical dumps and raw error objects", () => {
      const longError = "A".repeat(250);
      expect(humanizeError(longError)).toBe("The transaction failed. Please check your wallet and try again.");
      expect(humanizeError('{"code": 400, "detail": "bad request"}')).toBe("The transaction failed. Please check your wallet and try again.");
    });
  });
});
