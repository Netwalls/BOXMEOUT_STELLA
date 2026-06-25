export interface MarketOddsBarProps {
  poolA: bigint;
  poolB: bigint;
  fighterAName: string;
  fighterBName: string;
}

export function MarketOddsBar({ poolA, poolB, fighterAName, fighterBName }: MarketOddsBarProps): JSX.Element {
  const total = poolA + poolB;
  const pctA = total === BigInt(0) ? 50 : Number((poolA * BigInt(100)) / total);
  const pctB = 100 - pctA;

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{fighterAName} {pctA}%</span>
        <span>{pctB}% {fighterBName}</span>
      </div>
      <div className="flex rounded-full overflow-hidden h-3">
        <div className="bg-blue-500 transition-all" style={{ width: `${pctA}%` }} />
        <div className="bg-red-500 transition-all" style={{ width: `${pctB}%` }} />
      </div>
    </div>
  );
}
