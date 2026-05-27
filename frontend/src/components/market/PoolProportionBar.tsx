interface PoolProportionBarProps {
  pool_a: string;
  pool_b: string;
  pool_draw: string;
  fighter_a: string;
  fighter_b: string;
}

const EQUAL = 100 / 3;

function pct(pool: bigint, total: bigint): number {
  return total === 0n ? EQUAL : Number((pool * 10000n) / total) / 100;
}

export function PoolProportionBar({
  pool_a,
  pool_b,
  pool_draw,
  fighter_a,
  fighter_b,
}: PoolProportionBarProps): JSX.Element {
  const a = BigInt(pool_a);
  const b = BigInt(pool_b);
  const d = BigInt(pool_draw);
  const total = a + b + d;

  const pA = pct(a, total);
  const pD = pct(d, total);
  // Assign remainder to B so segments always sum to 100
  const pB = Math.max(0, 100 - pA - pD);

  const segments = [
    { label: fighter_a, pct: pA, bg: 'bg-red-600' },
    { label: 'Draw', pct: pD, bg: 'bg-gray-500' },
    { label: fighter_b, pct: pB, bg: 'bg-blue-600' },
  ];

  return (
    <div className="flex w-full h-8 rounded overflow-hidden" role="img" aria-label="Pool proportion">
      {segments.map(({ label, pct: p, bg }) => (
        <div
          key={label}
          className={`${bg} flex items-center justify-center overflow-hidden transition-[width] duration-500 ease-in-out`}
          style={{ width: `${p}%` }}
        >
          {p >= 10 && (
            <span className="text-white text-xs font-semibold truncate px-1 select-none">
              {p.toFixed(0)}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
