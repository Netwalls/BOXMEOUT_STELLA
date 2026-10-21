import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { TransactionStatusModal } from "./TransactionStatusModal";

describe("TransactionStatusModal accessibility (F-106)", () => {
  it("renders as a labelled modal dialog", () => {
    render(<TransactionStatusModal status="pending" onClose={jest.fn()} />);

    const dialog = screen.getByRole("dialog", { name: /transaction/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("ignores Escape while a transaction is in flight and announces it", () => {
    const onClose = jest.fn();
    render(<TransactionStatusModal status="pending" onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/in progress/i);
  });

  it("closes on Escape once the transaction has settled", () => {
    const onClose = jest.fn();
    render(<TransactionStatusModal status="success" onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("announces status changes through an aria-live region", () => {
    render(<TransactionStatusModal status="pending" onClose={jest.fn()} />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
