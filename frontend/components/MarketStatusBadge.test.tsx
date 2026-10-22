import React from "react";
import { render, screen } from "@testing-library/react";
import { MarketStatusBadge } from "./MarketStatusBadge";
import { MarketStatus } from "@/lib/api";

const STATUSES: MarketStatus[] = ["Open", "Locked", "Resolved", "Disputed", "Cancelled"];

describe("MarketStatusBadge", () => {
  it.each(STATUSES)("renders %s with correct label and snapshot", (status) => {
    const { container } = render(<MarketStatusBadge status={status} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  // ── Cancel reason badges (merged from f105-f108) ──────────────────────────

  it("shows a distinct Draw badge with refund copy", () => {
    render(<MarketStatusBadge status="Cancelled" cancelReason="Draw" />);

    expect(screen.getByText("Draw")).toBeInTheDocument();
    expect(screen.getByText(/full refund/i)).toBeInTheDocument();
    expect(screen.queryByText("Cancelled")).not.toBeInTheDocument();
  });

  it("shows a distinct No Contest badge with refund copy", () => {
    render(<MarketStatusBadge status="Cancelled" cancelReason="NoContest" />);

    expect(screen.getByText("No Contest")).toBeInTheDocument();
    expect(screen.getByText(/full refund/i)).toBeInTheDocument();
  });

  it("shows a distinct Admin cancelled badge", () => {
    render(<MarketStatusBadge status="Cancelled" cancelReason="AdminCancelled" />);

    expect(screen.getByText("Admin cancelled")).toBeInTheDocument();
  });

  it("keeps the generic Cancelled label when no reason is given", () => {
    render(<MarketStatusBadge status="Cancelled" />);

    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });
});
