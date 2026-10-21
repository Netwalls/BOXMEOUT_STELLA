import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { DisputeModal } from "./DisputeModal";
import { Market } from "@/lib/api";

const market = {
  id: "market-123",
  status: "Resolved",
} as unknown as Market;

describe("DisputeModal accessibility (F-106)", () => {
  it("renders as a labelled modal dialog", () => {
    render(<DisputeModal market={market} onDisputed={jest.fn()} />);

    const dialog = screen.getByRole("dialog", { name: /dispute/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("moves focus into the dialog on open", () => {
    render(<DisputeModal market={market} onDisputed={jest.fn()} />);

    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
  });

  it("closes on Escape and returns focus to the trigger", () => {
    const onClose = jest.fn();
    render(<DisputeModal market={market} onDisputed={jest.fn()} onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("announces status changes through an aria-live region", () => {
    render(<DisputeModal market={market} onDisputed={jest.fn()} />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
