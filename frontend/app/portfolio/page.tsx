"use client";
import { useMemo, useState } from "react";
import { PortfolioTable } from "@/components/PortfolioTable";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useWallet } from "@/hooks/useWallet";
import { useMarkets } from "@/hooks/useMarkets";
import { useClaimWinnings } from "@/hooks/useClaimWinnings";
import { useClaimRefund } from "@/hooks/useClaimRefund";
import { useToast } from "@/components/ToastProvider";
import type { Bet, Market } from "@/lib/api";

/** Returns every bet that can currently be claimed (winner or refundable, not yet claimed). */
function getClaimableBets(bets: Bet[], markets: Record<string, Market>): Bet[] {
  return bets.filter((bet) => {
    if (bet.claimed) return false;
    const market = markets[bet.marketId];
    if (!market) return false;
    const isWinner = market.status === "Resolved" && market.outcome === bet.side;
    const isRefundable =
      market.status === "Cancelled" || market.outcome === "NoContest";
    return isWinner || isRefundable;
  });
}

export default function PortfolioPage(): JSX.Element {
  const { address, connect } = useWallet();
  const { bets, summary, isLoading, refetch } = usePortfolio(address);
  const { markets: marketList } = useMarkets();
  const { claim } = useClaimWinnings();
  const { claimRefund } = useClaimRefund();
  const { addToast: showToast } = useToast();

  // Claim-all progress state
  const [claimAllProgress, setClaimAllProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  // Build lookup map: marketId → Market
  const marketsMap = useMemo<Record<string, Market>>(
    () =>
      marketList.reduce<Record<string, Market>>((acc, m) => {
        acc[m.id] = m;
        return acc;
      }, {}),
    [marketList]
  );

  const claimableBets = useMemo(
    () => getClaimableBets(bets, marketsMap),
    [bets, marketsMap]
  );

  const isClaimingAll = claimAllProgress !== null;

  async function handleClaimAll() {
    if (isClaimingAll || claimableBets.length === 0) return;

    const total = claimableBets.length;
    setClaimAllProgress({ current: 0, total });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < claimableBets.length; i++) {
      setClaimAllProgress({ current: i + 1, total });
      const bet = claimableBets[i];
      const market = marketsMap[bet.marketId];

      try {
        const isRefundable =
          market.status === "Cancelled" || market.outcome === "NoContest";
        if (isRefundable) {
          await claimRefund(bet.id, market.id);
        } else {
          await claim(bet.id, market.id);
        }
        successCount++;
      } catch {
        failCount++;
      }
    }

    setClaimAllProgress(null);
    refetch();

    if (failCount === 0) {
      showToast(`All ${successCount} claims successful!`, "success");
    } else if (successCount > 0) {
      showToast(
        `${successCount} claimed, ${failCount} failed. Check individual rows.`,
        "success"
      );
    } else {
      showToast("All claims failed. Please try again.", "error");
    }
  }

  if (!address) {
    return (
      <div className="container mx-auto px-4 py-8 text-center text-gray-400">
        <p className="text-4xl mb-4">👛</p>
        <p className="mb-6 text-lg">Connect your wallet to view your portfolio.</p>
        <WalletConnectButton onConnected={connect} />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-white">My Portfolio</h1>

        {!isLoading && claimableBets.length > 0 && (
          <button
            onClick={handleClaimAll}
            disabled={isClaimingAll}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-semibold transition-colors"
          >
            {isClaimingAll ? (
              <>
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
                Claiming {claimAllProgress!.current}/{claimAllProgress!.total}…
              </>
            ) : (
              <>Claim all ({claimableBets.length})</>
            )}
          </button>
        )}
      </div>

      {isLoading ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-gray-800 rounded-xl p-4 animate-pulse h-24" />
            ))}
          </div>
          <LoadingSkeleton variant="table" count={5} />
        </>
      ) : (
        <>
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <p className="text-xs text-gray-400 uppercase tracking-wider">Total Staked</p>
                <p className="text-xl font-bold text-white mt-1">
                  {(Number(BigInt(summary.totalStaked)) / 1e7).toFixed(2)} XLM
                </p>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <p className="text-xs text-gray-400 uppercase tracking-wider">Total Winnings</p>
                <p className="text-xl font-bold text-white mt-1">
                  {(Number(BigInt(summary.totalWinnings)) / 1e7).toFixed(2)} XLM
                </p>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <p className="text-xs text-gray-400 uppercase tracking-wider">Pending Claims</p>
                <p className="text-xl font-bold text-white mt-1">
                  {(Number(BigInt(summary.pendingClaims)) / 1e7).toFixed(2)} XLM
                </p>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <p className="text-xs text-gray-400 uppercase tracking-wider">ROI</p>
                <p
                  className={`text-xl font-bold mt-1 ${
                    summary.roi >= 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {(summary.roi * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          )}

          <PortfolioTable
            bets={bets}
            markets={marketsMap}
            onClaimSuccess={refetch}
          />
        </>
      )}
    </div>
  );
}
