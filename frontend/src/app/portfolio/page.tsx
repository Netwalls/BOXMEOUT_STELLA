'use client';

// ============================================================
// BOXMEOUT — Portfolio Page (/portfolio)
// Shows the connected user's betting history and pending claims.
// ============================================================

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useWallet } from '../../hooks/useWallet';
import { usePortfolio } from '../../hooks/usePortfolio';
import { ConnectPrompt } from '../../components/ui/ConnectPrompt';
import { BetHistoryTable } from '../../components/bet/BetHistoryTable';
import { TxStatusToast } from '../../components/ui/TxStatusToast';

export default function PortfolioPage(): JSX.Element {
  const { isConnected } = useWallet();
  const { portfolio, isLoading, claimTxStatus, claimWinnings, claimRefund } = usePortfolio();
  const [dismissedError, setDismissedError] = useState(false);

  // Reset dismissedError when status changes from error
  useEffect(() => {
    if (dismissedError && claimTxStatus.status !== 'error') {
      setDismissedError(false);
    }
  }, [claimTxStatus.status, dismissedError]);

  // Show toast unless it's an error and user dismissed it
  const displayStatus = dismissedError && claimTxStatus.status === 'error' 
    ? { hash: null, status: 'idle' as const, error: null }
    : claimTxStatus;

  const handleDismiss = () => {
    if (claimTxStatus.status === 'error') {
      setDismissedError(true);
    }
  };

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

  const empty = !portfolio || (
    portfolio.active_bets.length === 0 &&
    portfolio.past_bets.length === 0 &&
    portfolio.pending_claims.length === 0
  );

  if (empty) {
    return (
      <main className="text-center mt-20 space-y-3 px-4">
        <p className="text-gray-400">No bets yet — find a fight to bet on</p>
        <Link href="/" className="text-amber-400 hover:text-amber-300 text-sm">Browse markets →</Link>
      </main>
    );
  }

  const winRate = portfolio!.total_staked_xlm > 0
    ? ((portfolio!.total_won_xlm / portfolio!.total_staked_xlm) * 100).toFixed(1)
    : '0.0';

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Stats — 2 cols on mobile, 4 on sm+ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Staked', value: `${portfolio!.total_staked_xlm.toFixed(2)} XLM` },
          { label: 'Total Won',    value: `${portfolio!.total_won_xlm.toFixed(2)} XLM` },
          { label: 'Total Lost',   value: `${portfolio!.total_lost_xlm.toFixed(2)} XLM` },
          { label: 'Win Rate',     value: `${winRate}%` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-900 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-400">{label}</p>
            <p className="text-base font-semibold text-white mt-1 break-words">{value}</p>
          </div>
        ))}
      </div>

      {portfolio!.pending_claims.length > 0 && (
        <section>
          <h2 className="text-amber-400 font-semibold mb-3">Pending Claims</h2>
          <BetHistoryTable bets={portfolio!.pending_claims} onClaim={claimWinnings} onRefund={claimRefund} />
        </section>
      )}

      {portfolio!.active_bets.length > 0 && (
        <section>
          <h2 className="text-white font-semibold mb-3">Active Bets</h2>
          <BetHistoryTable bets={portfolio!.active_bets} onClaim={claimWinnings} onRefund={claimRefund} />
        </section>
      )}

      <section>
        <h2 className="text-white font-semibold mb-3">Bet History</h2>
        <BetHistoryTable bets={portfolio!.past_bets} onClaim={claimWinnings} onRefund={claimRefund} />
      </section>

      <TxStatusToast txStatus={displayStatus} onDismiss={handleDismiss} />
    </main>
  );
}
