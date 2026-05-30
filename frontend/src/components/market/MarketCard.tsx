// ============================================================
// BOXMEOUT — MarketCard Component
// Compact card for the home page market grid.
// Contributors: implement the JSX body.
// ============================================================

import Link from 'next/link';
import type { Market } from '../../types';
import { MarketOddsBar } from './MarketOddsBar';
import { MarketStatusBadge } from './MarketStatusBadge';
import { CountdownTimer } from '../ui/CountdownTimer';

interface MarketCardProps {
  market: Market;
}

export function MarketCard({ market }: MarketCardProps): JSX.Element {
  const totalXlm = Math.floor(parseInt(market.total_pool, 10) / 1e7).toLocaleString();

  return (
    <Link
      href={`/markets/${market.market_id}`}
      className="block bg-gray-900 rounded-xl p-4 hover:bg-gray-800 transition-colors space-y-3"
    >
      {/* Fighters */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="font-bold text-white text-sm truncate">{market.fighter_a}</span>
        <span className="text-gray-500 text-xs shrink-0">vs</span>
        <span className="font-bold text-white text-sm truncate text-right">{market.fighter_b}</span>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-2">
        <MarketStatusBadge status={market.status} />
        <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full">{market.weight_class}</span>
        {market.title_fight && (
          <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">🏆 Title Fight</span>
        )}
      </div>

      {/* Odds bar */}
      <MarketOddsBar
        pool_a={market.pool_a}
        pool_b={market.pool_b}
        pool_draw={market.pool_draw}
        fighter_a={market.fighter_a}
        fighter_b={market.fighter_b}
      />

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <CountdownTimer targetDate={market.scheduled_at} label="Starts in" />
        <span>{totalXlm} XLM pooled</span>
      </div>
    </Link>
  );
}
