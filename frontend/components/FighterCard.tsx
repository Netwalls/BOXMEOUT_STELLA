import { Fighter } from "@/lib/api";

export interface FighterCardProps {
  fighter: Fighter;
  side: "A" | "B";
  poolAmount: bigint;
  impliedOdds: number;
}

export function FighterCard({ fighter, side, poolAmount, impliedOdds }: FighterCardProps): JSX.Element {
  const accent = side === "A" ? "border-blue-500 text-blue-400" : "border-red-500 text-red-400";
  const xlm = (Number(poolAmount) / 1e7).toFixed(2);

  return (
    <div className={`bg-gray-800 rounded-xl p-4 border-l-4 ${accent} flex-1 min-w-0`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-bold uppercase tracking-wider ${accent}`}>
          Fighter {side}
        </span>
        <span className="text-xs text-gray-400">{impliedOdds.toFixed(1)}%</span>
      </div>
      <h3 className="text-lg font-bold text-white truncate">{fighter.name}</h3>
      <p className="text-sm text-gray-400">{fighter.record} · {fighter.weightClass}</p>
      <p className="text-sm text-gray-400">{fighter.nationality}</p>
      <p className="mt-2 text-sm text-gray-300">Pool: <span className="text-white font-semibold">{xlm} XLM</span></p>
    </div>
  );
}
