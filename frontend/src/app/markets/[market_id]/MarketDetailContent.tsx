'use client';

import { useEffect, useState } from 'react';
import { useMarket } from '../../../hooks/useMarket';
import { MarketOddsBar } from '../../../components/market/MarketOddsBar';
import { MarketStatusBadge } from '../../../components/market/MarketStatusBadge';
import { CountdownTimer } from '../../../components/ui/CountdownTimer';
import { BetPanel } from '../../../components/bet/BetPanel';
import { BetList } from '../../../components/bet/BetList';
import { stellarExplorerUrl } from '../../../services/wallet';
import { fetchBetsByMarket, NotFoundError } from '../../../services/api';
import { useToast } from '../../../components/ui/ToastProvider';
import { useAppStore } from '../../../store';
import type { Bet } from '../../../types';

function fmtXlm(stroops: string) {
  return (parseInt(stroops, 10) / 1e7).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function MarketDetailContent({ market_id }: { market_id: string }): JSX.Element {
  const { market, isLoading, error } = useMarket(market_id);
  const [bets, setBets] = useState<Bet[]>([]);
  const walletAddress = useAppStore((s) => s.walletAddress);
  const toast = useToast();

  useEffect(() => {
    if (!market) return;

    fetchBetsByMarket(market_id)
      .then(setBets)
      .catch(() => {/* non-critical */});

    // Info toast when market is locked
    if (market.status === 'locked') {
      toast.info('Market is now locked — no new bets accepted.');
    }
  }, [market_id, market?.status]);

  if (isLoading) {
    return <main className="max-w-4xl mx-auto px-4 py-8 text-gray-400">Loading…</main>;
  }

  if (error instanceof NotFoundError || !market) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8 text-center">
        <p className="text-2xl font-bold text-white mb-2">404</p>
        <p className="text-gray-400">Market not found.</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8 text-center">
        <p className="text-gray-400">Failed to load market. Please try again.</p>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Fight header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <MarketStatusBadge status={market.status} />
          {market.title_fight && (
            <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">🏆 Title Fight</span>
          )}
          <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full">{market.weight_class}</span>
        </div>
        {/* #798: fighter names stack on mobile via flex-col sm:flex-row */}
        <h1 className="text-xl font-black text-white break-words">
          {market.fighter_a} <span className="text-gray-500">vs</span> {market.fighter_b}
        </h1>
        <p className="text-sm text-gray-400">{market.venue}</p>
        <CountdownTimer scheduled_at={market.scheduled_at} label="Starts in" />
      </div>

      {/* #798: OddsDisplay — wraps on narrow screens */}
      <div className="space-y-2">
        <MarketOddsBar
          pool_a={market.pool_a}
          pool_b={market.pool_b}
          pool_draw={market.pool_draw}
          fighter_a={market.fighter_a}
          fighter_b={market.fighter_b}
        />
        <div className="flex flex-wrap justify-between text-xs text-gray-400 gap-2">
          <span>{fmtXlm(market.pool_a)} XLM on {market.fighter_a}</span>
          <span>{fmtXlm(market.pool_draw)} XLM Draw</span>
          <span>{fmtXlm(market.pool_b)} XLM on {market.fighter_b}</span>
        </div>
      </div>

      {/* #798: FighterCards stack vertically on mobile, side-by-side on lg */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-gray-900 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Fighter A</p>
          <p className="text-white font-bold text-lg break-words">{market.fighter_a}</p>
          <p className="text-amber-400 text-sm mt-1">{(market.odds_a / 100).toFixed(1)}%</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Fighter B</p>
          <p className="text-white font-bold text-lg break-words">{market.fighter_b}</p>
          <p className="text-amber-400 text-sm mt-1">{(market.odds_b / 100).toFixed(1)}%</p>
        </div>
      </div>

      {/* #798: Two-column on desktop, single column on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* #798: BetForm full-width on mobile, right col on desktop */}
        <div className="lg:col-start-3 lg:row-start-1 w-full">
          <BetPanel market={market} />
        </div>

        {/* #796: BetList — left 2 cols on desktop */}
        <div className="lg:col-span-2 lg:row-start-1 space-y-3">
          <h2 className="text-white font-semibold">Recent Bets</h2>
          <BetList
            bets={bets}
            fighter_a={market.fighter_a}
            fighter_b={market.fighter_b}
            walletAddress={walletAddress}
          />
        </div>
      </div>

      {/* Oracle info — shown after resolution */}
      {market.status === 'resolved' && market.outcome && (
        <div className="bg-gray-900 rounded-xl p-4 text-sm space-y-2">
          <p className="text-gray-400">
            Outcome: <span className="text-white font-semibold capitalize">{market.outcome.replace('_', ' ')}</span>
          </p>
          {market.oracle_address && (
            <p className="text-gray-400">
              Oracle:{' '}
              {/* #797: Stellar Explorer link for oracle account */}
              <a
                href={stellarExplorerUrl('account', market.oracle_address)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 hover:underline font-mono text-xs break-all"
              >
                {market.oracle_address}
              </a>
            </p>
          )}
          {market.resolution_tx_hash && (
            <p className="text-gray-400">
              Resolution TX:{' '}
              {/* #797: Stellar Explorer link for resolution tx */}
              <a
                href={stellarExplorerUrl('tx', market.resolution_tx_hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 hover:underline font-mono text-xs break-all"
              >
                {market.resolution_tx_hash}
              </a>
            </p>
          )}
        </div>
      )}
    </main>
  );
}
