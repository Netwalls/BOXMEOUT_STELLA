interface MarketOddsBarProps {
  pool_a: string;
  pool_b: string;
  pool_draw: string;
  fighter_a: string;
  fighter_b: string;
}

const EQUAL = 100n / 3n; // 33n

function pct(pool: bigint, total: bigint): bigint {
  return total === 0n ? EQUAL : (pool * 100n) / total;
}

export function MarketOddsBar({
  pool_a,
  pool_b,
  pool_draw,
  fighter_a,
  fighter_b,
}: MarketOddsBarProps): JSX.Element {
  const a = BigInt(pool_a);
  const b = BigInt(pool_b);
  const d = BigInt(pool_draw);
  const total = a + b + d;

  const pA = pct(a, total);
  const pD = pct(d, total);
  // Assign remainder to B to ensure segments always sum to 100
  const pB = 100n - pA - pD;

  const segments = [
    { label: fighter_a, pct: pA, color: 'bg-blue-600' },
    { label: 'Draw',    pct: pD, color: 'bg-yellow-500' },
    { label: fighter_b, pct: pB, color: 'bg-red-600' },
  ];

  return (
    <div className="flex w-full h-8 rounded overflow-hidden">
      {segments.map(({ label, pct: p, color }) => (
        <div
          key={label}
          className={`${color} flex items-center justify-center overflow-hidden transition-[width] duration-[400ms] ease-in-out`}
          style={{ width: `${p}%` }}
        >
          {p >= 10n && (
            <span className="text-white text-xs font-semibold truncate px-1">
              {label} {p.toString()}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
