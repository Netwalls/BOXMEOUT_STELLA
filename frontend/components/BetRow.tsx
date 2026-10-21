"use client";

import { useState } from "react";
import { Bet, Market, BetSide, MarketStatus } from "@/lib/api";
import { useClaimWinnings } from "@/hooks/useClaimWinnings";
import { ClaimReceipt } from "@/components/ClaimButton";

export interface BetRowProps {
  bet: Bet;
  market: Market | undefined;
  onClaimed?: (receipt: ClaimReceipt) => void;
}

/**
 * Returns the derived status label for a bet, based on market and bet state.
 *
 * - "claimable" — market Resolved/Cancelled, bet is a winner or refund, not yet claimed
 * - "won"       — market Resolved, bet won, already claimed
 * - "lost"      — market Resolved, bet lost
 * - "open"      — market Open or Locked
 * - "refunded"  — market Cancelled, already claimed
 */
type BetStatus = "open" | "won" | "lost" | "claimable" | "refunded" | "unknown";

function deriveBetStatus(bet: Bet, market: Market | undefined): BetStatus {
  if (!market) return "unknown";

  const { status, outcome } = market;

  if (status === "Open" || status === "Locked" || status === "Disputed") {
    return "open";
  }

  if (status === "Cancelled") {
    return bet.claimed ? "refunded" : "claimable";
  }

  if (status === "Resolved") {
    const won = outcome === bet.side;
    if (won) {
      return bet.claimed ? "won" : "claimable";
    }
    return "lost";
  }

  return "unknown";
}

const STATUS_STYLES: Record<BetStatus, string> = {
  open: "bg-blue-900/40 text-blue-300 border border-blue-700",
  won: "bg-green-900/40 text-green-300 border border-green-700",
  lost: "bg-red-900/40 text-red-300 border border-red-700",
  claimable: "bg-amber-900/40 text-amber-300 border border-amber-600 animate-pulse",
  refunded: "bg-gray-700 text-gray-300 border border-gray-600",
  unknown: "bg-gray-700 text-gray-400 border border-gray-600",
};

const STATUS_LABEL: Record<BetStatus, string> = {
  open: "Open",
  won: "Won",
  lost: "Lost",
  claimable: "Claimable",
  refunded: "Refunded",
  unknown: "—",
};

function StatusBadge({ status }: { status: BetStatus }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function BetRow({ bet, market, onClaimed }: BetRowProps): JSX.Element {
  const { claim, isLoading } = useClaimWinnings();
  const [localClaimed, setLocalClaimed] = useState(false);

  // Merge server state with optimistic local state
  const effectiveBet: Bet = localClaimed ? { ...bet, claimed: true } : bet;
  const betStatus = deriveBetStatus(effectiveBet, market);

  const fightLabel = market
    ? `${market.fighterA.name} vs ${market.fighterB.name}`
    : bet.marketId;

  const xlm = (Number(BigInt(bet.amount)) / 1e7).toFixed(2);

  const payout =
    bet.payout != null
      ? `${(Number(BigInt(bet.payout)) / 1e7).toFixed(2)} XLM`
      : "—";

  const isClaimable = betStatus === "claimable";
  const isClaimed = betStatus === "won" || betStatus === "refunded" || localClaimed;

  async function handleClaim() {
    if (!market || isLoading) return;
    try {
      const receipt = await claim(bet.id, market.id);
      // Reflect claimed state immediately (optimistic update)
      setLocalClaimed(true);
      onClaimed?.(receipt);
    } catch {
      // Error state is surfaced by the hook; UI remains interactive
    }
  }

  return (
    <tr className="bg-gray-900 hover:bg-gray-800 transition-colors">
      {/* Fight */}
      <td className="px-4 py-3 text-white text-sm whitespace-nowrap">
        {fightLabel}
      </td>

      {/* Side */}
      <td className="px-4 py-3 text-sm whitespace-nowrap">
        <span
          className={
            bet.side === "FighterA" ? "text-blue-400 font-medium" : "text-red-400 font-medium"
          }
        >
          {bet.side === "FighterA" ? "Fighter A" : "Fighter B"}
        </span>
      </td>

      {/* Amount */}
      <td className="px-4 py-3 text-gray-300 text-sm whitespace-nowrap">{xlm} XLM</td>

      {/* Status badge */}
      <td className="px-4 py-3 whitespace-nowrap">
        <StatusBadge status={betStatus} />
      </td>

      {/* Payout */}
      <td className="px-4 py-3 text-gray-300 text-sm whitespace-nowrap">{payout}</td>

      {/* Claim action */}
      <td className="px-4 py-3 whitespace-nowrap">
        {isClaimed ? (
          <button
            disabled
            className="h-9 px-4 bg-green-800 text-green-200 text-xs font-semibold rounded-lg opacity-70 cursor-not-allowed"
          >
            Claimed
          </button>
        ) : isClaimable ? (
          <button
            onClick={handleClaim}
            disabled={isLoading}
            aria-busy={isLoading}
            className="h-9 px-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-2"
          >
            {isLoading && (
              <svg
                className="animate-spin h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
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
            {market?.status === "Cancelled" ? "Claim Refund" : "Claim Winnings"}
          </button>
        ) : null}
      </td>
    </tr>
  );
}
