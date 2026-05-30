'use client';

// ============================================================
// BOXMEOUT — FighterCard Component
// Used on the market detail page to display each fighter.
// ============================================================

import Image from 'next/image';

interface FighterCardProps {
  name: string;
  /** Implied probability in basis points (0–10000) */
  odds: number;
  /** Pool amount in XLM (pre-computed float) */
  poolXlm: number;
  /** Optional photo URL; falls back to placeholder */
  photoUrl?: string;
  /** Highlight border when user has bet on this fighter */
  isUserBet?: boolean;
  /** Show trophy icon if this fighter won */
  isWinner?: boolean;
}

export function FighterCard({
  name,
  odds,
  poolXlm,
  photoUrl,
  isUserBet = false,
  isWinner = false,
}: Readonly<FighterCardProps>): JSX.Element {
  const oddsPercent = (odds / 100).toFixed(1);
  const poolFormatted = poolXlm.toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-xl bg-gray-900 p-5 transition-colors ${
        isUserBet ? 'ring-2 ring-amber-400' : 'ring-1 ring-gray-800'
      }`}
    >
      {/* Avatar */}
      <div className="relative w-20 h-20 rounded-full overflow-hidden bg-gray-800 flex items-center justify-center shrink-0">
        {photoUrl ? (
          <Image src={photoUrl} alt={name} fill className="object-cover" sizes="80px" />
        ) : (
          <span className="text-3xl select-none">🥊</span>
        )}
        {isWinner && (
          <span className="absolute -top-1 -right-1 text-lg leading-none" title="Winner" aria-label="Winner">
            🏆
          </span>
        )}
      </div>

      {/* Name */}
      <p className="font-bold text-white text-center text-sm leading-tight">{name}</p>

      {/* Odds */}
      <div className="text-center">
        <p className="text-2xl font-bold text-amber-400">{oddsPercent}%</p>
        <p className="text-xs text-gray-500 mt-0.5">implied odds</p>
      </div>

      {/* Pool */}
      <div className="text-center">
        <p className="text-sm font-semibold text-white">{poolFormatted} XLM</p>
        <p className="text-xs text-gray-500">in pool</p>
      </div>

      {isUserBet && (
        <span className="text-xs text-amber-400 font-medium bg-amber-400/10 px-2 py-0.5 rounded-full">
          Your pick
        </span>
      )}
    </div>
  );
}
