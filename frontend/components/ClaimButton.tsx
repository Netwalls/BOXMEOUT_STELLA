"use client";
import { useState } from "react";
import { Bet, Market } from "@/lib/api";
import { useClaimWinnings } from "@/hooks/useClaimWinnings";

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

export function ClaimButton({ bet, market, onClaimed }: ClaimButtonProps): JSX.Element | null {
  const [loading, setLoading] = useState(false);
  const { claim } = useClaimWinnings();

  const isWinner = market.status === "Resolved" && market.outcome === bet.side;
  const isCancelled = market.status === "Cancelled";
  const showButton = (isWinner || isCancelled) && !bet.claimed;

  if (bet.claimed) {
    return (
      <button
        disabled
        className="h-11 px-4 bg-green-700 text-white text-sm font-semibold rounded-lg opacity-60 cursor-not-allowed"
      >
        Claimed
      </button>
    );
  }

  if (!showButton) return null;

  const label = isCancelled ? "Claim Refund" : "Claim Winnings";

  async function handleClaim() {
    if (loading) return;
    setLoading(true);
    try {
      const receipt = await claim(bet.id, market.id);
      onClaimed(receipt);
    } catch {
      // error handled by hook
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClaim}
      disabled={loading}
      className="h-11 px-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-sm font-semibold rounded-lg transition-colors inline-flex items-center gap-2"
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {label}
    </button>
  );
}
