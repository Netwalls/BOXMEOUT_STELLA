import {
  DISPUTE_WINDOW_MS,
  getClaimBlockReason,
  getResolutionStage,
} from "@/lib/resolution";

const RESOLVED_AT = "2026-10-01T12:00:00Z";
const RESOLVED_AT_MS = new Date(RESOLVED_AT).getTime();

function market(status: "Open" | "Locked" | "Resolved" | "Disputed" | "Cancelled", resolvedAt?: string) {
  return { status, scheduledAt: "2026-09-30T00:00:00Z", resolvedAt };
}

describe("getResolutionStage", () => {
  it("maps open, locked, disputed and cancelled markets directly", () => {
    expect(getResolutionStage(market("Open"))).toBe("open");
    expect(getResolutionStage(market("Locked"))).toBe("locked");
    expect(getResolutionStage(market("Disputed", RESOLVED_AT))).toBe("disputed");
    expect(getResolutionStage(market("Cancelled"))).toBe("cancelled");
  });

  it("keeps a resolved market in the dispute window until 24 hours have passed", () => {
    const m = market("Resolved", RESOLVED_AT);
    expect(getResolutionStage(m, RESOLVED_AT_MS + DISPUTE_WINDOW_MS - 1)).toBe("dispute-window");
    expect(getResolutionStage(m, RESOLVED_AT_MS + DISPUTE_WINDOW_MS)).toBe("finalized");
  });

  it("falls back to scheduledAt when resolvedAt is missing", () => {
    const m = market("Resolved");
    const scheduledMs = new Date("2026-09-30T00:00:00Z").getTime();
    expect(getResolutionStage(m, scheduledMs + 1000)).toBe("dispute-window");
    expect(getResolutionStage(m, scheduledMs + DISPUTE_WINDOW_MS + 1)).toBe("finalized");
  });
});

describe("getClaimBlockReason", () => {
  it("explains the wait during the dispute window and on disputed markets", () => {
    expect(getClaimBlockReason("dispute-window")).toMatch(/dispute window/);
    expect(getClaimBlockReason("disputed")).toMatch(/admin/);
  });

  it("returns null when a claim can go ahead or the market is cancelled", () => {
    expect(getClaimBlockReason("finalized")).toBeNull();
    expect(getClaimBlockReason("cancelled")).toBeNull();
  });
});
