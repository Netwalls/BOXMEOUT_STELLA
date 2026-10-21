import React from "react";
import { render, screen } from "@testing-library/react";
import { MarketStatusBadge } from "./MarketStatusBadge";

describe("MarketStatusBadge outcome labels (F-105)", () => {
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
