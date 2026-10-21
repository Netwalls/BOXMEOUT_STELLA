import type { Market } from "@/lib/api";

/** How long after resolution a market can be disputed before winnings are final. */
export const DISPUTE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Where a market sits in its lifecycle from the bettor's point of view.
 * `dispute-window` means resolved but winnings are not yet claimable.
 */
export type ResolutionStage =
  | "open"
  | "locked"
  | "dispute-window"
  | "finalized"
  | "disputed"
  | "cancelled";

/**
 * The API does not always send `resolvedAt`; without it the market's scheduled
 * time is the closest proxy, which is how the dispute window was calculated before.
 */
export function getResolvedAtMs(market: Pick<Market, "resolvedAt" | "scheduledAt">): number {
  return new Date(market.resolvedAt ?? market.scheduledAt).getTime();
}

export function getDisputeWindowEndsAtMs(market: Pick<Market, "resolvedAt" | "scheduledAt">): number {
  return getResolvedAtMs(market) + DISPUTE_WINDOW_MS;
}

export function getResolutionStage(
  market: Pick<Market, "status" | "resolvedAt" | "scheduledAt">,
  now: number = Date.now()
): ResolutionStage {
  switch (market.status) {
    case "Open":
      return "open";
    case "Locked":
      return "locked";
    case "Disputed":
      return "disputed";
    case "Cancelled":
      return "cancelled";
    case "Resolved":
      return now < getDisputeWindowEndsAtMs(market) ? "dispute-window" : "finalized";
  }
}

/**
 * Why a bet cannot be claimed yet in this stage, or null when it can.
 * Refunds on cancelled markets are never blocked.
 */
export function getClaimBlockReason(stage: ResolutionStage): string | null {
  if (stage === "disputed") return "Claims open once the disputed result is decided by an admin.";
  if (stage === "dispute-window") return "Claimable after the dispute window closes.";
  return null;
}
