// ============================================================
// BOXMEOUT — PoolBar Component
// Visual representation of pool proportions
// ============================================================

interface PoolBarProps {
  pool_a: string;
  pool_b: string;
  pool_draw: string;
  fighter_a: string;
  fighter_b: string;
}

/**
 * PoolBar shows the relative sizes of each outcome pool as a stacked bar.
 */
export function PoolBar({ pool_a, pool_b, pool_draw, fighter_a, fighter_b }: PoolBarProps): JSX.Element {
  const poolANum = parseInt(pool_a, 10) / 1e7;
  const poolBNum = parseInt(pool_b, 10) / 1e7;
  const poolDrawNum = parseInt(pool_draw, 10) / 1e7;
  const total = poolANum + poolBNum + poolDrawNum;

  const percentA = total > 0 ? (poolANum / total) * 100 : 0;
  const percentB = total > 0 ? (poolBNum / total) * 100 : 0;
  const percentDraw = total > 0 ? (poolDrawNum / total) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex h-8 rounded-lg overflow-hidden bg-gray-800">
        {percentA > 0 && (
          <div
            style={{ width: `${percentA}%` }}
            className="bg-blue-600 flex items-center justify-center text-xs font-semibold text-white"
          >
            {percentA > 10 && `${percentA.toFixed(0)}%`}
          </div>
        )}
        {percentDraw > 0 && (
          <div
            style={{ width: `${percentDraw}%` }}
            className="bg-purple-600 flex items-center justify-center text-xs font-semibold text-white"
          >
            {percentDraw > 10 && `${percentDraw.toFixed(0)}%`}
          </div>
        )}
        {percentB > 0 && (
          <div
            style={{ width: `${percentB}%` }}
            className="bg-red-600 flex items-center justify-center text-xs font-semibold text-white"
          >
            {percentB > 10 && `${percentB.toFixed(0)}%`}
          </div>
        )}
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>{fighter_a}</span>
        <span>Draw</span>
        <span>{fighter_b}</span>
      </div>
    </div>
  );
}
