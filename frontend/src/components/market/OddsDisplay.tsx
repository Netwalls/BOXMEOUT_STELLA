interface OddsDisplayProps {
  pool_a: string;
  pool_b: string;
  pool_draw: string;
  fee_bps: number;
  fighter_a: string;
  fighter_b: string;
}

interface Outcome {
  label: string;
  pool: bigint;
  color: string;
}

/**
 * Parimutuel multiplier = (total_pool * (1 - fee)) / outcome_pool
 * Returns null when pool is zero.
 */
function multiplier(outcomePool: bigint, totalPool: bigint, feeBps: number): number | null {
  if (outcomePool === 0n || totalPool === 0n) return null;
  const net = totalPool * BigInt(10000 - feeBps);
  return Number(net) / Number(outcomePool) / 10000;
}

export function OddsDisplay({
  pool_a,
  pool_b,
  pool_draw,
  fee_bps,
  fighter_a,
  fighter_b,
}: OddsDisplayProps): JSX.Element {
  const a = BigInt(pool_a);
  const b = BigInt(pool_b);
  const d = BigInt(pool_draw);
  const total = a + b + d;

  const outcomes: Outcome[] = [
    { label: fighter_a, pool: a, color: 'text-red-400' },
    { label: 'Draw', pool: d, color: 'text-gray-400' },
    { label: fighter_b, pool: b, color: 'text-blue-400' },
  ];

  // Favorite = outcome with the largest pool (highest implied probability)
  const maxPool = outcomes.reduce((max, o) => (o.pool > max ? o.pool : max), 0n);
  const hasFavorite = total > 0n;

  return (
    <div className="flex gap-2">
      {outcomes.map(({ label, pool, color }) => {
        const mult = multiplier(pool, total, fee_bps);
        const impliedPct = total > 0n && pool > 0n
          ? ((Number(pool) / Number(total)) * 100).toFixed(0)
          : null;
        const isFavorite = hasFavorite && pool === maxPool;

        return (
          <div
            key={label}
            className={`flex-1 flex flex-col items-center rounded-lg py-2 px-1 transition-colors ${
              isFavorite ? 'bg-gray-700 ring-1 ring-amber-500/60' : 'bg-gray-800'
            }`}
          >
            <span className="text-gray-400 text-xs truncate w-full text-center mb-1">{label}</span>
            <span className={`font-bold text-sm transition-all duration-300 ${color}`}>
              {mult !== null ? `${mult.toFixed(2)}x` : '—'}
            </span>
            <span className="text-gray-500 text-xs mt-0.5">
              {impliedPct !== null ? `${impliedPct}%` : '—'}
            </span>
            {isFavorite && (
              <span className="text-amber-400 text-[10px] mt-0.5 font-medium">FAV</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
