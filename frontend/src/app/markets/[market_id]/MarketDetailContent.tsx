'use client';

import { useEffect, useState } from 'react';
import { useMarket } from '../../../hooks/useMarket';
import { MarketOddsBar } from '../../../components/market/MarketOddsBar';
import { MarketStatusBadge } from '../../../components/market/MarketStatusBadge';
import { CountdownTimer } from '../../../components/ui/CountdownTimer';
import { BetPanel } from '../../../components/bet/BetPanel';
import { stellarExplorerUrl } from '../../../services/wallet';
import { fetchBetsByMarket, NotFoundError } from '../../../services/api';
import type { Bet } from '../../../types';

const SIDE_LABEL: Record<string, string> = {
  fighter_a: 'Fighter A',
  fighter_b: 'Fighter B',
  draw: 'Draw',
};

function truncate(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtXlm(stroops: string) {
  return (parseInt(stroops, 10) / 1e7).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function MarketDetailContent({ market_id }: { market_id: string }): JSX.Element {
  const { market, isLoading, error } = useMarket(market_id);
  const [recentBets, setRecentBets] = useState<Bet[]>([]);

  useEffect(() => {
    if (!market) return;
    fetchBetsByMarket(market_id)
      .then((bets) => setRecentBets(bets.slice(0, 20)))
      .catch(() => {/* non-critical */});
  }, [market_id, market]);

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

  const sideLabel = (side: string) =>
    side === 'fighter_a' ? market.fighter_a : side === 'fighter_b' ? market.fighter_b : 'Draw';

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
        <h1 className="text-xl font-black text-white break-words">
          {market.fighter_a} <span className="text-gray-500">vs</span> {market.fighter_b}
        </h1>
        <p className="text-sm text-gray-400">{market.venue}</p>
        <CountdownTimer scheduled_at={market.scheduled_at} label="Starts in" />
      </div>

      {/* Odds bar + pool sizes */}
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

      {/* Two-column on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* BetPanel — right col on desktop */}
        <div className="lg:col-start-3 lg:row-start-1">
          <BetPanel market={market} />
        </div>

        {/* Recent bets — left 2 cols on desktop */}
        <div className="lg:col-span-2 lg:row-start-1 space-y-3">
          <h2 className="text-white font-semibold">Recent Bets</h2>
          {recentBets.length === 0 ? (
            <p className="text-gray-500 text-sm">No bets yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left text-gray-300">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-800">
                    <th className="pb-2 pr-4">Bettor</th>
                    <th className="pb-2 pr-4">Side</th>
                    <th className="pb-2 pr-4">Amount</th>
                    <th className="pb-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentBets.map((bet) => (
                    <tr key={bet.tx_hash} className="border-b border-gray-800/50">
                      <td className="py-2 pr-4 font-mono text-xs">
                        <a
                          href={stellarExplorerUrl('tx', bet.tx_hash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-400 hover:underline"
                        >
                          {truncate(bet.tx_hash)}
                        </a>
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">{sideLabel(bet.side)}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{bet.amount_xlm} XLM</td>
                      <td className="py-2 text-gray-500 whitespace-nowrap text-xs">
                        {new Date(bet.placed_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
