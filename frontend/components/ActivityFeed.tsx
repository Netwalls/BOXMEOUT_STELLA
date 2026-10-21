"use client";

import Link from "next/link";
import { Bet, Market } from "@/lib/api";
import { stellarExpertTxUrl } from "@/lib/stellar";

export interface ActivityFeedProps {
  bets: Bet[];
  markets: Record<string, Market>;
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
}

/**
 * Chronological history of a wallet's bets, with a link to each market and to the
 * transaction on stellar.expert. Bet ids are transaction hashes, as set by usePlaceBet.
 */
export function ActivityFeed({
  bets,
  markets,
  isLoading,
  error,
  hasMore,
  onLoadMore,
  onRetry,
}: ActivityFeedProps): JSX.Element {
  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-red-800 bg-red-900/20 p-4 text-sm text-red-300 space-y-2">
        <p>Could not load your activity. {error.message}</p>
        <button type="button" onClick={onRetry} className="text-amber-400 underline underline-offset-2">
          Try again
        </button>
      </div>
    );
  }

  if (!isLoading && bets.length === 0) {
    return <p className="rounded-xl border border-gray-700 p-6 text-center text-sm text-gray-500">No activity yet.</p>;
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-gray-700 rounded-xl border border-gray-700">
        {bets.map((bet) => {
          const market = markets[bet.marketId];
          const fight = market ? `${market.fighterA.name} vs ${market.fighterB.name}` : bet.marketId;
          const xlm = (Number(BigInt(bet.amount)) / 1e7).toFixed(2);

          return (
            <li key={bet.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div className="min-w-0">
                <Link href={`/markets/${bet.marketId}`} className="text-white hover:underline">
                  {fight}
                </Link>
                <p className="text-xs text-gray-500">
                  {new Date(bet.placedAt).toLocaleString()} · {bet.side === "FighterA" ? "Fighter A" : "Fighter B"} · {xlm} XLM
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className={bet.claimed ? "text-green-300" : "text-gray-400"}>
                  {bet.claimed ? "Claimed" : "Pending"}
                </span>
                <a
                  href={stellarExpertTxUrl(bet.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:underline"
                >
                  Transaction
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </div>
            </li>
          );
        })}
      </ul>

      {isLoading && <p className="text-center text-sm text-gray-500">Loading activity…</p>}

      {hasMore && !isLoading && (
        <button
          type="button"
          onClick={onLoadMore}
          className="w-full rounded-lg border border-gray-600 py-2 text-sm text-gray-300 hover:border-gray-400 hover:text-white"
        >
          Load more
        </button>
      )}
    </div>
  );
}
