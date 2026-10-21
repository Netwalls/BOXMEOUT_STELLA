import React from "react";
import { render, screen, within } from "@testing-library/react";
import { ResolutionTimeline, getTimelineSteps } from "./ResolutionTimeline";
import { Market, MarketStatus } from "@/lib/api";

const RESOLVED_AT = "2026-10-01T12:00:00Z";
const RESOLVED_AT_MS = new Date(RESOLVED_AT).getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

function makeMarket(status: MarketStatus, resolvedAt: string | null = null): Market {
  return {
    id: "m-1",
    contractAddress: "C1",
    fighterA: { name: "Maya Chen", record: "10-0", nationality: "US", weightClass: "Welter" },
    fighterB: { name: "Rico Alvarez", record: "9-1", nationality: "MX", weightClass: "Welter" },
    scheduledAt: "2026-09-30T00:00:00Z",
    bettingEndsAt: "2026-09-29T23:00:00Z",
    status,
    outcome: status === "Resolved" ? "FighterA" : null,
    poolA: "0",
    poolB: "0",
    totalPool: "0",
    oracleAddress: "G1",
    createdBy: "G2",
    resolvedAt,
  };
}

function stepStates(): string[] {
  const list = screen.getByRole("list", { name: "Resolution timeline" });
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.textContent ?? "");
}

describe("getTimelineSteps", () => {
  it("marks only the locked step as current while betting is closed", () => {
    const steps = getTimelineSteps("locked");
    expect(steps.map((s) => s.state)).toEqual(["current", "upcoming", "upcoming", "upcoming"]);
  });

  it("marks every step done once the market is finalized", () => {
    expect(getTimelineSteps("finalized").every((s) => s.state === "done")).toBe(true);
  });

  it("returns no steps for a cancelled market", () => {
    expect(getTimelineSteps("cancelled")).toEqual([]);
  });
});

describe("ResolutionTimeline", () => {
  it("shows the open market as all upcoming", () => {
    render(<ResolutionTimeline market={makeMarket("Open")} />);
    expect(stepStates().every((text) => text.includes("(upcoming)"))).toBe(true);
  });

  it("shows the locked state with betting closed", () => {
    render(<ResolutionTimeline market={makeMarket("Locked")} />);
    const current = screen.getByText("Locked").closest("li");
    expect(current).toHaveAttribute("aria-current", "step");
  });

  it("shows the dispute window countdown while winnings are not yet claimable", () => {
    jest.spyOn(Date, "now").mockReturnValue(RESOLVED_AT_MS + 1000);
    render(<ResolutionTimeline market={makeMarket("Resolved", RESOLVED_AT)} />);
    expect(screen.getByText(/Winnings become claimable in/)).toBeInTheDocument();
    expect(screen.getByText("23:59:59")).toBeInTheDocument();
    jest.restoreAllMocks();
  });

  it("shows every step complete after the dispute window has passed", () => {
    render(<ResolutionTimeline market={makeMarket("Resolved", RESOLVED_AT)} now={RESOLVED_AT_MS + DAY_MS + 1} />);
    expect(stepStates().every((text) => text.includes("(complete)"))).toBe(true);
  });

  it("explains that a disputed result is pending admin decision", () => {
    render(<ResolutionTimeline market={makeMarket("Disputed", RESOLVED_AT)} />);
    expect(screen.getByRole("status")).toHaveTextContent("An admin decision is pending");
    expect(screen.getByText("Disputed")).toBeInTheDocument();
  });

  it("explains a cancelled market instead of showing steps", () => {
    render(<ResolutionTimeline market={makeMarket("Cancelled")} />);
    expect(screen.getByText(/This market was cancelled/)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Resolution timeline" })).not.toBeInTheDocument();
  });
});
