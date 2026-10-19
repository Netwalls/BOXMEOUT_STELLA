"use client";
import { useState } from "react";
import { Bet, Market } from "@/lib/api";
import { useClaimWinnings } from "@/hooks/useClaimWinnings";
import { useClaimRefund } from "@/hooks/useClaimRefund";
import { getClaimBlockReason, getResolutionStage } from "@/lib/resolution";

export interface ClaimReceipt {
  betId: string;
  bettor: string;
  payout: bigint;
  claimedAt: string;
}

export interface ClaimButtonProps {
  bet: Bet;
  market: Market | undefined;
  onClaimed: (receipt: ClaimReceipt) => void;
}

export function ClaimButton({ bet, market, onClaimed }: ClaimButtonProps): JSX.Element | null {
  const [loading, setLoading] = useState(false);
  const { claim } = useClaimWinnings();
  const { claimRefund } = useClaimRefund();

  // Can't determine claim eligibility without market data
  if (!market) return null;

  // A disputed market still has an outcome; its claim is blocked by getClaimBlockReason
  const hasOutcome = market.status === "Resolved" || market.status === "Disputed";
  const isWinner = hasOutcome && market.outcome === bet.side;
  const isRefundable =
    (market.status === "Cancelled" || market.outcome === "NoContest") && !bet.claimed;
  const showButton = (isWinner || isRefundable) && !bet.claimed;
  const blockReason = showButton ? getClaimBlockReason(getResolutionStage(market)) : null;

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

  const label = isRefundable ? "Claim Refund" : "Claim Winnings";

  if (blockReason) {
    return (
      <div className="flex flex-col gap-1">
        <button
          disabled
          className="h-11 px-4 bg-amber-500 text-black text-sm font-semibold rounded-lg opacity-40 cursor-not-allowed"
        >
          {label}
        </button>
        <p className="text-xs text-gray-400">{blockReason}</p>
      </div>
    );
  }

  async function handleClaim() {
    if (loading || !market) return;
    setLoading(true);
    try {
      let receipt: ClaimReceipt;
      if (isRefundable) {
        receipt = await claimRefund(bet.id, market.id);
      } else {
        receipt = await claim(bet.id, market.id);
      }
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
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
      )}
      {label}
    </button>
  );
}
