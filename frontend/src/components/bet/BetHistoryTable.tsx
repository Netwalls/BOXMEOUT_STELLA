'use client';

// ============================================================
// BOXMEOUT — BetHistoryTable Component
// ============================================================

import { useState, useMemo } from 'react';
import type { Bet, Market } from '../../types';

type FilterTab = 'All' | 'Active' | 'Won' | 'Lost' | 'Pending Claim';
type SortKey = 'placed_at' | 'amount_xlm';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 10;
const TABS: FilterTab[] = ['All', 'Active', 'Won', 'Lost', 'Pending Claim'];

function getBetStatus(bet: Bet): 'Active' | 'Won' | 'Lost' | 'Pending Claim' | 'Claimed' {
  if (bet.claimed) return 'Claimed';
  const payout = bet.payout !== null ? parseFloat(bet.payout) : null;
  if (payout === null) return 'Active';
  if (payout > 0) return 'Pending Claim';
  return 'Lost';
}

interface BetHistoryTableProps {
  bets: Bet[];
  /** Optional map of market_id → Market for displaying fighter names */
  markets?: Record<string, Market>;
  onClaim: (market_id: string) => void;
  onRefund: (market_id: string) => void;
}

export function BetHistoryTable({ bets, markets, onClaim, onRefund }: BetHistoryTableProps): JSX.Element {
  const [tab, setTab] = useState<FilterTab>('All');
  const [sortKey, setSortKey] = useState<SortKey>('placed_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(1);
  };

  const filtered = useMemo(() => {
    return bets.filter((bet) => {
      if (tab === 'All') return true;
      const status = getBetStatus(bet);
      if (tab === 'Active') return status === 'Active';
      if (tab === 'Won') return status === 'Claimed';
      if (tab === 'Lost') return status === 'Lost';
      if (tab === 'Pending Claim') return status === 'Pending Claim';
      return true;
    });
  }, [bets, tab]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'placed_at') {
        cmp = new Date(a.placed_at).getTime() - new Date(b.placed_at).getTime();
      } else {
        cmp = a.amount_xlm - b.amount_xlm;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕';

  if (bets.length === 0) {
    return <p className="text-gray-500 text-sm text-center py-6">No bets yet.</p>;
  }

  return (
    <div className="space-y-3">
      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setPage(1); }}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-medium transition-colors ${
              tab === t
                ? 'bg-amber-500 text-black'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="min-w-full text-sm text-left text-gray-300">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-800">
              <th className="pb-2 pr-4 whitespace-nowrap">Market</th>
              <th className="pb-2 pr-4 whitespace-nowrap">My Bet</th>
              <th
                className="pb-2 pr-4 whitespace-nowrap cursor-pointer hover:text-gray-300 select-none"
                onClick={() => handleSort('amount_xlm')}
              >
                Amount<SortIcon col="amount_xlm" />
              </th>
              <th className="pb-2 pr-4 whitespace-nowrap">Odds</th>
              <th className="pb-2 pr-4 whitespace-nowrap">Status</th>
              <th className="pb-2 pr-4 whitespace-nowrap">Payout</th>
              <th
                className="pb-2 pr-4 whitespace-nowrap cursor-pointer hover:text-gray-300 select-none"
                onClick={() => handleSort('placed_at')}
              >
                Date<SortIcon col="placed_at" />
              </th>
              <th className="pb-2 whitespace-nowrap">Action</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-gray-500 text-sm">
                  No bets in this category.
                </td>
              </tr>
            ) : (
              paginated.map((bet) => {
                const market = markets?.[bet.market_id];
                const marketLabel = market
                  ? `${market.fighter_a} vs ${market.fighter_b}`
                  : bet.market_id.slice(0, 8) + '…';
                const sideLabel = bet.side === 'fighter_a'
                  ? market?.fighter_a ?? 'Fighter A'
                  : bet.side === 'fighter_b'
                  ? market?.fighter_b ?? 'Fighter B'
                  : 'Draw';
                const payout = bet.payout !== null ? parseFloat(bet.payout) : null;
                const status = getBetStatus(bet);

                // Odds: derive from market if available
                const oddsVal = market
                  ? bet.side === 'fighter_a'
                    ? (market.odds_a / 100).toFixed(0) + '%'
                    : bet.side === 'fighter_b'
                    ? (market.odds_b / 100).toFixed(0) + '%'
                    : (market.odds_draw / 100).toFixed(0) + '%'
                  : '—';

                let action: JSX.Element;
                if (status === 'Pending Claim') {
                  action = (
                    <button
                      onClick={() => onClaim(bet.market_id)}
                      className="min-h-[36px] px-3 rounded-lg bg-amber-500 hover:bg-amber-400 font-semibold text-black text-xs"
                    >
                      Claim
                    </button>
                  );
                } else if (payout !== null && payout < 0) {
                  action = (
                    <button
                      onClick={() => onRefund(bet.market_id)}
                      className="min-h-[36px] px-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs"
                    >
                      Refund
                    </button>
                  );
                } else {
                  action = <span className="text-gray-600">—</span>;
                }

                const statusColor =
                  status === 'Claimed' ? 'text-green-400'
                  : status === 'Pending Claim' ? 'text-amber-400'
                  : status === 'Lost' ? 'text-red-400'
                  : 'text-gray-400';

                return (
                  <tr key={bet.tx_hash} className="border-b border-gray-800/50">
                    <td className="py-3 pr-4 text-xs whitespace-nowrap text-gray-300">{marketLabel}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">{sideLabel}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">{bet.amount_xlm} XLM</td>
                    <td className="py-3 pr-4 whitespace-nowrap text-gray-400">{oddsVal}</td>
                    <td className={`py-3 pr-4 whitespace-nowrap text-xs font-medium ${statusColor}`}>
                      {status}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {payout !== null && payout >= 0 ? `${payout.toFixed(2)} XLM` : '—'}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-xs text-gray-500">
                      {new Date(bet.placed_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 whitespace-nowrap">{action}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="min-h-[32px] px-3 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ←
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="min-h-[32px] px-3 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
