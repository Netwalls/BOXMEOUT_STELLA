"use client";
import { Bet, Market } from "@/lib/api";

export interface ClaimReceipt {
  betId: string;
  bettor: string;
  payout: bigint;
  claimedAt: string;
}

export interface ClaimButtonProps {
  bet: Bet;
  market: Market;
  onClaimed: (receipt: ClaimReceipt) => void;
}

export function ClaimButton({ bet, market }: ClaimButtonProps): JSX.Element {
  const claimable =
    !bet.claimed && (market.status === "Resolved" || market.status === "Cancelled");
  const label = market.status === "Cancelled" ? "Claim Refund" : "Claim Winnings";

  return (
    <button
      disabled={!claimable}
      className="h-11 px-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-sm font-semibold rounded-lg transition-colors"
    >
      {bet.claimed ? "Claimed" : label}
    </button>
  );
}
