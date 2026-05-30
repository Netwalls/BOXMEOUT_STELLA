'use client';

// ============================================================
// BOXMEOUT — Portfolio Page (/portfolio)
// ============================================================

import { useMemo, useCallback, useState, useEffect } from 'react';
import Link from 'next/link';
import { useWallet } from '../../hooks/useWallet';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useMarkets } from '../../hooks/useMarkets';
import { ConnectPrompt } from '../../components/ui/ConnectPrompt';
import { BetHistoryTable } from '../../components/bet/BetHistoryTable';
import { useToast } from '../../components/ui/ToastProvider';
import type { Bet } from '../../types';

// ─── BettorStats ─────────────────────────────────────────────────────────────

interface BettorStatsProps {
  totalStaked: number;
  totalWon: number;
  totalLost: number;
  pendingClaimsCount: number;
}

function BettorStats({ totalStaked, totalWon, totalLost, pendingClaimsCount }: BettorStatsProps) {
  const winRate = totalStaked > 0 ? ((totalWon / totalStaked) * 100).toFixed(1) : '0.0';
  const stats = [
    { label: 'Total Staked', value: `${totalStaked.toFixed(2)} XLM` },
    { label: 'Total Won',    value: `${totalWon.toFixed(2)} XLM`,  color: 'text-green-400' },
    { label: 'Total Lost',   value: `${totalLost.toFixed(2)} XLM`, color: 'text-red-400' },
    { label: 'Win Rate',     value: `${winRate}%` },
    { label: 'Pending Claims', value: String(pendingClaimsCount), color: pendingClaimsCount > 0 ? 'text-amber-400' : undefined },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {stats.map(({ label, value, color }) => (
        <div key={label} className="bg-gray-900 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400">{label}</p>
          <p className={`text-base font-semibold mt-1 break-words ${color ?? 'text-white'}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PortfolioPage(): JSX.Element {
  const { isConnected } = useWallet();
  const { portfolio, isLoading, claimTxStatus, claimWinnings, claimRefund } = usePortfolio();
  const { markets } = useMarkets();
  const [claimingAll, setClaimingAll] = useState(false);
  const toast = useToast();

  const marketsMap = useMemo(
    () => Object.fromEntries(markets.map((m) => [m.market_id, m])),
    [markets],
  );

  const allBets: Bet[] = useMemo(() => {
    if (!portfolio) return [];
    return [
      ...portfolio.pending_claims,
      ...portfolio.active_bets,
      ...portfolio.past_bets,
    ];
  }, [portfolio]);

  const handleClaimAll = useCallback(async () => {
    if (!portfolio || claimingAll) return;
    setClaimingAll(true);
    // Deduplicate by market_id — one tx per claimable market
    const uniqueMarkets = [...new Set(portfolio.pending_claims.map((b) => b.market_id))];
    for (const market_id of uniqueMarkets) {
      await claimWinnings(market_id);
    }
    setClaimingAll(false);
  }, [portfolio, claimWinnings, claimingAll]);

  // Toast feedback for claim/refund transactions
  useEffect(() => {
    if (claimTxStatus.status === 'success') {
      toast.success('Winnings claimed successfully!');
    } else if (claimTxStatus.status === 'error') {
      toast.error(claimTxStatus.error ?? 'Claim failed. Please try again.');
    }
  }, [claimTxStatus.status]);

  if (!isConnected) {
    return (
      <main className="max-w-2xl mx-auto mt-20 px-4">
        <ConnectPrompt message="Connect your Freighter wallet to view your portfolio" />
      </main>
    );
  }

  if (isLoading) {
    return <main className="text-center mt-20 text-gray-400">Loading portfolio…</main>;
  }

  const isEmpty = !portfolio || allBets.length === 0;

  if (isEmpty) {
    return (
      <main className="text-center mt-20 space-y-3 px-4">
        <p className="text-4xl">🥊</p>
        <p className="text-gray-400">No bets yet — find a fight to bet on</p>
        <Link href="/" className="inline-block text-amber-400 hover:text-amber-300 text-sm">
          Browse markets →
        </Link>
      </main>
    );
  }

  const pendingCount = portfolio!.pending_claims.length;

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-bold text-white">My Portfolio</h1>
        {pendingCount > 0 && (
          <button
            onClick={handleClaimAll}
            disabled={claimingAll || claimTxStatus.status === 'pending'}
            className="min-h-[44px] px-5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-black text-sm"
          >
            {claimingAll ? 'Claiming…' : `Claim All (${pendingCount})`}
          </button>
        )}
      </div>

      {/* Stats */}
      <BettorStats
        totalStaked={portfolio!.total_staked_xlm}
        totalWon={portfolio!.total_won_xlm}
        totalLost={portfolio!.total_lost_xlm}
        pendingClaimsCount={pendingCount}
      />

      {/* Bet history */}
      <section>
        <h2 className="text-white font-semibold mb-3">Bet History</h2>
        <BetHistoryTable
          bets={allBets}
          markets={marketsMap}
          onClaim={claimWinnings}
          onRefund={claimRefund}
        />
      </section>
    </main>
  );
}
