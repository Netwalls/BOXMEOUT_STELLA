'use client';

import { useState } from 'react';
import type { Bet, BetSide } from '../../types';
import { stellarExplorerUrl } from '../../services/wallet';

const PAGE_SIZE = 10;

const SIDE_COLORS: Record<BetSide, string> = {
  fighter_a: 'bg-blue-500/20 text-blue-300',
  fighter_b: 'bg-red-500/20 text-red-300',
  draw: 'bg-gray-500/20 text-gray-300',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function truncateTx(hash: string): string {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

interface BetListProps {
  bets: Bet[];
  fighterA: string;
  fighterB: string;
  walletAddress?: string | null;
  isLoading?: boolean;
}

export function BetList({ bets, fighterA, fighterB, walletAddress, isLoading }: Readonly<BetListProps>): JSX.Element {
  const [page, setPage] = useState(1);

  const sideLabel = (side: BetSide): string => {
    if (side === 'fighter_a') return fighterA;
    if (side === 'fighter_b') return fighterB;
    return 'Draw';
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <h2 className="text-white font-semibold">Recent Bets</h2>
        <div className="text-gray-500 text-sm">Loading…</div>
      </div>
    );
  }

  if (bets.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-white font-semibold">Recent Bets</h2>
        <p className="text-gray-500 text-sm">No bets yet.</p>
      </div>
    );
  }

  const sorted = [...bets].sort(
    (a, b) => new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime(),
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-3">
      <h2 className="text-white font-semibold">Recent Bets</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-left text-gray-300">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-800">
              <th className="pb-2 pr-4">Bettor</th>
              <th className="pb-2 pr-4">Outcome</th>
              <th className="pb-2 pr-4">Amount</th>
              <th className="pb-2">Time</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((bet) => {
              const isOwn = walletAddress
                ? bet.tx_hash.toLowerCase().startsWith(walletAddress.slice(0, 6).toLowerCase())
                : false;

              return (
                <tr
                  key={bet.tx_hash}
                  className={`border-b border-gray-800/50 ${isOwn ? 'bg-amber-500/5' : ''}`}
                >
                  <td className="py-2 pr-4 font-mono text-xs">
                    <a
                      href={stellarExplorerUrl('tx', bet.tx_hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-400 hover:underline"
                      title={bet.tx_hash}
                    >
                      {truncateTx(bet.tx_hash)}
                    </a>
                    {isOwn && (
                      <span className="ml-1 text-amber-400 text-xs">(you)</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${SIDE_COLORS[bet.side]}`}
                    >
                      {sideLabel(bet.side)}
                    </span>
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">{bet.amount_xlm} XLM</td>
                  <td className="py-2 text-gray-500 whitespace-nowrap text-xs">
                    {timeAgo(bet.placed_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} of{' '}
            {sorted.length}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="min-h-[44px] min-w-[44px] px-3 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ‹
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="min-h-[44px] min-w-[44px] px-3 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
