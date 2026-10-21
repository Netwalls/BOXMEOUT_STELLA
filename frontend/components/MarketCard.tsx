import Link from "next/link";
import { Market, MarketStatus } from "@/lib/api";
import { MarketStatusBadge } from "./MarketStatusBadge";
import { MarketOddsBar } from "./MarketOddsBar";
import { CountdownTimer } from "./CountdownTimer";

export interface MarketCardProps {
  market: Market;
  showOdds?: boolean;
}

/** Returns the bottom-section content for each market status */
function MarketCardFooter({ market }: { market: Market }): JSX.Element {
  const { status, bettingEndsAt, scheduledAt, outcome, fighterA, fighterB, poolA, poolB } = market;

  switch (status as MarketStatus) {
    case "Open": {
      // Show countdown to betting end and live odds bar
      const endsAtSecs = Math.floor(new Date(bettingEndsAt).getTime() / 1000);
      return (
        <div className="flex flex-col gap-2">
          <CountdownTimer targetTimestamp={endsAtSecs} label="Bets close" />
          <MarketOddsBar
            poolA={BigInt(poolA)}
            poolB={BigInt(poolB)}
            fighterAName={fighterA.name}
            fighterBName={fighterB.name}
          />
        </div>
      );
    }

    case "Locked": {
      // Bets are locked — show fight date countdown
      const fightSecs = Math.floor(new Date(scheduledAt).getTime() / 1000);
      return (
        <div className="flex flex-col gap-2">
          <CountdownTimer targetTimestamp={fightSecs} label="Fight starts" />
          <MarketOddsBar
            poolA={BigInt(poolA)}
            poolB={BigInt(poolB)}
            fighterAName={fighterA.name}
            fighterBName={fighterB.name}
          />
        </div>
      );
    }

    case "Resolved": {
      // Show winner
      const winner =
        outcome === "FighterA"
          ? fighterA.name
          : outcome === "FighterB"
          ? fighterB.name
          : outcome === "Draw"
          ? "Draw"
          : outcome === "NoContest"
          ? "No Contest"
          : "—";
      return (
        <p className="text-sm text-gray-400">
          Winner:{" "}
          <span className="text-amber-400 font-semibold">{winner}</span>
        </p>
      );
    }

    case "Cancelled":
      return (
        <p className="text-sm text-gray-500 italic">
          This market was cancelled. Bets will be refunded.
        </p>
      );

    case "Disputed":
      return (
        <p className="text-sm text-yellow-500 italic">
          Result under dispute. Awaiting resolution.
        </p>
      );

    default:
      return <></>;
  }
}

export default function MarketCard({ market, showOdds = true }: MarketCardProps): JSX.Element {
  return (
    <Link
      href={`/markets/${market.id}`}
      aria-label={`${market.fighterA.name} versus ${market.fighterB.name}, ${market.status}`}
      className="block bg-gray-800 hover:bg-gray-750 rounded-xl p-4 border border-gray-700 hover:border-gray-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-white text-sm leading-tight">
          {market.fighterA.name} vs {market.fighterB.name}
        </h3>
        <MarketStatusBadge status={market.status} />
      </div>

      {/* Weight class + date */}
      <p className="text-xs text-gray-500 mb-3">
        {market.fighterA.weightClass} ·{" "}
        <time dateTime={market.scheduledAt}>
          {new Date(market.scheduledAt).toLocaleDateString()}
        </time>
      </p>

      {/* Status-specific footer */}
      <MarketCardFooter market={market} />
    </Link>
  );
}
