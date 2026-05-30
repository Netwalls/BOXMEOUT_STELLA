'use client';

import { useEffect, useState } from 'react';
import { useMarket } from '../../../hooks/useMarket';
import { MarketStatusBadge } from '../../../components/market/MarketStatusBadge';
import { CountdownTimer } from '../../../components/ui/CountdownTimer';
import { FighterCard } from '../../../components/market/FighterCard';
import { OddsDisplay } from '../../../components/market/OddsDisplay';
import { PoolBar } from '../../../components/market/PoolBar';
import { BetForm } from '../../../components/bet/BetForm';
import { BetList } from '../../../components/bet/BetList';
import { stellarExplorerUrl } from '../../../services/wallet';
import { fetchBetsByMarket, NotFoundError } from '../../../services/api';
import { ClaimWinningsPanel } from '../../../components/market/ClaimWinningsPanel';
import { useToast } from '../../../components/ui/ToastProvider';
import { useAppStore } from '../../../store';
import type { Bet } from '../../../types';

export default function MarketDetailContent({ market_id }: { market_id: string }): JSX.Element {
  const { market, isLoading, error } = useMarket(market_id);
  const [recentBets, setRecentBets] = useState<Bet[]>([]);
  const [betsLoading, setBetsLoading] = useState(false);
  const walletAddress = useAppStore((s) => s.walletAddress);
  const toast = useToast();

  useEffect(() => {
    if (!market) return;
    setBetsLoading(true);
    fetchBetsByMarket(market_id)
      .then((bets) => setRecentBets(bets.slice(0, 20)))
      .catch(() => {
        /* non-critical */
      })
      .finally(() => setBetsLoading(false));

    if (market.status === 'locked') {
      toast.info('Market is now locked — no new bets accepted.');
    }
  }, [market_id, market?.status]);

  if (isLoading) {
    return <main className="max-w-6xl mx-auto px-4 py-8 text-gray-400">Loading…</main>;
  }

  if (error instanceof NotFoundError || !market) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-8 text-center">
        <p className="text-2xl font-bold text-white mb-2">404</p>
        <p className="text-gray-400">Market not found.</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-8 text-center">
        <p className="text-gray-400">Failed to load market. Please try again.</p>
      </main>
    );
  }

  const poolAXlm = parseInt(market.pool_a, 10) / 1e7;
  const poolBXlm = parseInt(market.pool_b, 10) / 1e7;

  return (
    <main className="max-w-6xl mx-auto px-4 py-6 space-y-8">
      {/* Fight header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <MarketStatusBadge status={market.status} />
          {market.title_fight && (
            <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
              🏆 Title Fight
            </span>
          )}
          <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full">
            {market.weight_class}
          </span>
        </div>
        <h1 className="text-3xl font-black text-white break-words">
          {market.fighter_a} <span className="text-gray-500">vs</span> {market.fighter_b}
        </h1>
        <p className="text-sm text-gray-400">{market.venue}</p>
        <CountdownTimer targetDate={market.scheduled_at} label="Starts in" />
      </div>

      {/* Fighter cards side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FighterCard name={market.fighter_a} odds={market.odds_a} poolXlm={poolAXlm} />
        <FighterCard name={market.fighter_b} odds={market.odds_b} poolXlm={poolBXlm} />
      </div>

      {/* Odds display with multipliers */}
      <OddsDisplay
        pool_a={market.pool_a}
        pool_b={market.pool_b}
        pool_draw={market.pool_draw}
        fee_bps={market.fee_bps}
        fighter_a={market.fighter_a}
        fighter_b={market.fighter_b}
      />

      {/* Pool proportion bar */}
      <PoolBar
        pool_a={market.pool_a}
        pool_b={market.pool_b}
        pool_draw={market.pool_draw}
        fighter_a={market.fighter_a}
        fighter_b={market.fighter_b}
      />

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bet form — right col on desktop */}
        <div className="lg:col-start-3 lg:row-start-1 w-full space-y-4">
          <BetForm market={market} />
          <ClaimWinningsPanel market={market} allBets={recentBets} />
        </div>

        {/* Recent bets — left 2 cols on desktop */}
        <div className="lg:col-span-2 lg:row-start-1 space-y-3">
          <BetList
            bets={recentBets}
            fighterA={market.fighter_a}
            fighterB={market.fighter_b}
            walletAddress={walletAddress}
            isLoading={betsLoading}
          />
        </div>
      </div>

      {/* Oracle info — shown after resolution */}
      {market.status === 'resolved' && market.outcome && (
        <div className="bg-gray-900 rounded-xl p-4 text-sm space-y-2">
          <p className="text-gray-400">
            Outcome:{' '}
            <span className="text-white font-semibold capitalize">
              {market.outcome.replace('_', ' ')}
            </span>
          </p>
          {market.oracle_address && (
            <p className="text-gray-400">
              Oracle:{' '}
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
