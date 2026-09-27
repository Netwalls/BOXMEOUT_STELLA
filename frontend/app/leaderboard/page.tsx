"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, Trophy } from "lucide-react";
import { fetchLeaderboard, LeaderboardEntry, LeaderboardPeriod } from "@/lib/api";
import { truncateAddress } from "@/lib/stellar";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";

// ─── Period tab config ────────────────────────────────────────────────────────

const PERIODS: { label: string; value: LeaderboardPeriod }[] = [
  { label: "7 Days", value: "7d" },
  { label: "30 Days", value: "30d" },
  { label: "All Time", value: "all" },
];

// ─── Copy-to-clipboard cell ───────────────────────────────────────────────────

function AddressCell({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available (e.g. non-HTTPS dev environment)
    }
  }, [address]);

  return (
    <span className="flex items-center gap-1.5">
      <span className="font-mono text-sm text-gray-200">{truncateAddress(address)}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied!" : `Copy address ${address}`}
        title={copied ? "Copied!" : "Copy address"}
        className="text-gray-500 hover:text-amber-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-400" aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
    </span>
  );
}

// ─── Rank medal ───────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-xl" aria-label="1st place">🥇</span>;
  if (rank === 2) return <span className="text-xl" aria-label="2nd place">🥈</span>;
  if (rank === 3) return <span className="text-xl" aria-label="3rd place">🥉</span>;
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-700 text-gray-300 text-xs font-bold">
      {rank}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LeaderboardPage(): JSX.Element {
  const [period, setPeriod] = useState<LeaderboardPeriod>("7d");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchLeaderboard(period)
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load leaderboard.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [period]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Trophy className="h-7 w-7 text-amber-400" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
      </div>

      {/* Period tabs */}
      <div
        role="tablist"
        aria-label="Leaderboard period"
        className="flex gap-1 bg-gray-800 rounded-xl p-1 w-fit"
      >
        {PERIODS.map(({ label, value }) => (
          <button
            key={value}
            role="tab"
            aria-selected={period === value}
            onClick={() => setPeriod(value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
              period === value
                ? "bg-amber-500 text-black"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton variant="table" count={10} />
      ) : error ? (
        <div
          role="alert"
          className="rounded-xl bg-red-900/20 border border-red-800 p-6 text-center text-red-400"
        >
          {error}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl bg-gray-800 border border-gray-700 p-12 text-center text-gray-500">
          <Trophy className="h-10 w-10 mx-auto mb-3 opacity-30" aria-hidden="true" />
          <p className="text-lg font-medium">No data yet for this period.</p>
          <p className="text-sm mt-1">Place bets to appear on the leaderboard.</p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={period}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-700">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Leaderboard for the past {period === "all" ? "all time" : period}
                </caption>
                <thead className="bg-gray-800">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider w-16">
                      Rank
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Address
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Winnings
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Bets
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Win Rate
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      ROI
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {entries.map((entry) => {
                    const winnings = (Number(BigInt(entry.totalWinnings)) / 1e7).toFixed(2);
                    const winRate =
                      entry.totalBets > 0
                        ? ((entry.winCount / entry.totalBets) * 100).toFixed(0)
                        : "—";
                    const roi = (entry.roi * 100).toFixed(1);
                    const roiPositive = entry.roi >= 0;

                    return (
                      <tr
                        key={entry.address}
                        className={`bg-gray-900 hover:bg-gray-800/60 transition-colors ${
                          entry.rank <= 3 ? "border-l-2 border-amber-500/40" : ""
                        }`}
                      >
                        <td className="px-4 py-3 text-center">
                          <RankBadge rank={entry.rank} />
                        </td>
                        <td className="px-4 py-3">
                          <AddressCell address={entry.address} />
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-amber-400">
                          {winnings} XLM
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">
                          {entry.totalBets}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">
                          {winRate}{entry.totalBets > 0 ? "%" : ""}
                        </td>
                        <td className={`px-4 py-3 text-right font-medium ${roiPositive ? "text-green-400" : "text-red-400"}`}>
                          {roiPositive ? "+" : ""}{roi}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="sm:hidden space-y-3">
              {entries.map((entry) => {
                const winnings = (Number(BigInt(entry.totalWinnings)) / 1e7).toFixed(2);
                const winRate =
                  entry.totalBets > 0
                    ? ((entry.winCount / entry.totalBets) * 100).toFixed(0)
                    : "—";
                const roi = (entry.roi * 100).toFixed(1);
                const roiPositive = entry.roi >= 0;

                return (
                  <div
                    key={entry.address}
                    className={`bg-gray-800 rounded-xl p-4 border ${
                      entry.rank <= 3 ? "border-amber-500/40" : "border-gray-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <RankBadge rank={entry.rank} />
                      <span className="font-bold text-amber-400">{winnings} XLM</span>
                    </div>
                    <div className="mb-2">
                      <AddressCell address={entry.address} />
                    </div>
                    <div className="flex gap-4 text-xs text-gray-400">
                      <span>{entry.totalBets} bets</span>
                      <span>Win rate: {winRate}{entry.totalBets > 0 ? "%" : ""}</span>
                      <span className={roiPositive ? "text-green-400" : "text-red-400"}>
                        ROI: {roiPositive ? "+" : ""}{roi}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
