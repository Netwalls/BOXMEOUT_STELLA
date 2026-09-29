"use client";
import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useMarket } from "@/hooks/useMarket";
import { useMarketBets } from "@/hooks/useMarketBets";
import { useMarketEvents } from "@/hooks/useMarketEvents";
import { useToast } from "@/components/ToastProvider";
import { Market, Bet } from "@/lib/api";
import { FighterCard } from "@/components/FighterCard";
import { BetForm } from "@/components/BetForm";
import { MarketStatusBadge } from "@/components/MarketStatusBadge";
import { CountdownTimer } from "@/components/CountdownTimer";
import { DisputeModal } from "@/components/DisputeModal";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";

// recharts is only needed on this page; keep it out of the shared bundle
const OutcomeChart = dynamic(() => import("@/components/OutcomeChart").then((m) => m.OutcomeChart), {
  ssr: false,
  loading: () => <LoadingSkeleton variant="chart" />,
});
const MarketOddsChart = dynamic(
  () => import("@/components/MarketOddsChart").then((m) => m.MarketOddsChart),
  { ssr: false, loading: () => <LoadingSkeleton variant="chart" /> }
);

const DISPUTE_WINDOW_SEC = 24 * 60 * 60; // 24 h

function isInDisputeWindow(market: Market): boolean {
  if (market.status !== "Resolved") return false;
  // scheduledAt is the closest proxy for resolvedAt we have on the type
  const resolvedAt = new Date(market.scheduledAt).getTime();
  return Date.now() - resolvedAt < DISPUTE_WINDOW_SEC * 1000;
}

function BetHistoryRow({ bet }: { bet: Bet }): JSX.Element {
  const xlm = (Number(BigInt(bet.amount)) / 1e7).toFixed(2);
  return (
    <tr className="border-b border-gray-700 text-sm">
      <td className="py-2 pr-4 text-gray-300 font-mono text-xs truncate max-w-[120px]">{bet.bettor}</td>
      <td className={`py-2 pr-4 font-medium ${bet.side === "FighterA" ? "text-blue-400" : "text-red-400"}`}>
        {bet.side === "FighterA" ? "Fighter A" : "Fighter B"}
      </td>
      <td className="py-2 pr-4 text-white">{xlm} XLM</td>
      <td className="py-2 text-gray-400 text-xs">{new Date(bet.placedAt).toLocaleString()}</td>
    </tr>
  );
}

export interface MarketDetailClientProps {
  marketId: string;
  initialMarket: Market;
  initialBets: Bet[];
  initialOddsHistory: import("@/lib/api").OddsSnapshot[];
}

export function MarketDetailClient({
  marketId,
  initialMarket,
  initialBets,
  initialOddsHistory,
}: MarketDetailClientProps): JSX.Element {
  const { market } = useMarket(marketId);
  const { bets: liveBets } = useMarketBets(marketId);
  const { poolA: livePoolA, poolB: livePoolB } = useMarketEvents(marketId);
  const { addToast } = useToast();
  const [justPlaced, setJustPlaced] = useState<Bet[]>([]);
  const [showDispute, setShowDispute] = useState(false);

  // Use live polled data once available, fall back to SSR initial data
  const m = market ?? initialMarket;
  const oddsHistory = initialOddsHistory;

  const polledBets = liveBets.length ? liveBets : initialBets;
  // Show a bet placed this session immediately, ahead of the next bet-list poll
  const bets = [...justPlaced.filter((b) => !polledBets.some((pb) => pb.id === b.id)), ...polledBets];

  // useMarketEvents drives live pool totals; fall back to the polled market until the first event lands
  const poolA = livePoolA ?? BigInt(m.poolA);
  const poolB = livePoolB ?? BigInt(m.poolB);
  const total = poolA + poolB;
  const oddsA = total === BigInt(0) ? 50 : Number((poolA * BigInt(100)) / total);
  const oddsB = 100 - oddsA;

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    const title = `${m.fighterA.name} vs ${m.fighterB.name}`;
    const text = `Check out this boxing prediction market on BOXMEOUT: ${title}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        // User cancelled — no feedback needed
      }
      return;
    }

    // Fallback: copy link to clipboard
    try {
      await navigator.clipboard.writeText(url);
      addToast("Link copied to clipboard!", "success");
    } catch {
      addToast("Could not copy link.", "error");
    }
  }, [m.fighterA.name, m.fighterB.name, addToast]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-white">
          {m.fighterA.name} vs {m.fighterB.name}
        </h1>
        <MarketStatusBadge status={m.status} />
        <button
          onClick={handleShare}
          aria-label="Share this market"
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-600 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:border-gray-400 hover:text-white transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          Share
        </button>
      </div>

      <CountdownTimer
        targetTimestamp={Math.floor(new Date(m.bettingEndsAt).getTime() / 1000)}
        label="Betting closes in"
        expiredLabel="Locked"
      />

      {/* Fighter cards */}
      <div className="flex flex-col md:flex-row gap-4">
        <FighterCard fighter={m.fighterA} side="A" poolAmount={poolA} impliedOdds={oddsA} />
        <FighterCard fighter={m.fighterB} side="B" poolAmount={poolB} impliedOdds={oddsB} />
      </div>

      <OutcomeChart
        poolA={poolA}
        poolB={poolB}
        labelA={m.fighterA.name}
        labelB={m.fighterB.name}
      />

      <MarketOddsChart marketId={marketId} historicalOdds={oddsHistory} />

      <BetForm
        market={m}
        onBetPlaced={(bet) => setJustPlaced((prev) => [bet, ...prev])}
      />

      {/* Bet history */}
      {bets.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Public Bet History</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-700">
                  <th className="pb-2 text-left pr-4">Address</th>
                  <th className="pb-2 text-left pr-4">Side</th>
                  <th className="pb-2 text-left pr-4">Amount</th>
                  <th className="pb-2 text-left">Date</th>
                </tr>
              </thead>
              <tbody>
                {bets.map((bet) => <BetHistoryRow key={bet.id} bet={bet} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dispute section */}
      {isInDisputeWindow(m) && !showDispute && (
        <button
          onClick={() => setShowDispute(true)}
          className="w-full rounded-xl border border-amber-500 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-400 hover:bg-amber-500/20 transition-colors"
        >
          Dispute Result
        </button>
      )}

      {showDispute && (
        <DisputeModal market={m} onDisputed={() => setShowDispute(false)} />
      )}
    </div>
  );
}
