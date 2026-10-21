"use client";
import { BarChart, Bar, XAxis, YAxis, Cell, LabelList, ResponsiveContainer } from "recharts";

export interface OutcomeChartProps {
  poolA: bigint;
  poolB: bigint;
  labelA: string;
  labelB: string;
}

/**
 * Visualizes the yes/no (fighter A / fighter B) pool split as a bar chart.
 * Falls back to an even 50/50 split when the pool is empty so we never divide by zero.
 */
export function OutcomeChart({ poolA, poolB, labelA, labelB }: OutcomeChartProps): JSX.Element {
  const total = poolA + poolB;
  const hasPool = total > BigInt(0);
  const pctA = hasPool ? Number((poolA * BigInt(1000)) / total) / 10 : 50;
  const pctB = hasPool ? Math.round((100 - pctA) * 10) / 10 : 50;

  const data = [
    { name: labelA, pct: pctA },
    { name: labelB, pct: pctB },
  ];

  const summary = `${labelA} ${pctA}%, ${labelB} ${pctB}%${hasPool ? "" : " (no bets placed yet)"}`;

  return (
    <div className="w-full bg-gray-800 rounded-xl p-3">
      <p className="sr-only">Outcome split: {summary}</p>
      <div className="w-full h-40" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis
              type="category"
              dataKey="name"
              width={90}
              tick={{ fill: "#e5e7eb", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Bar dataKey="pct" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              <Cell fill="#3b82f6" />
              <Cell fill="#ef4444" />
              <LabelList dataKey="pct" position="right" formatter={(v: number) => `${v}%`} fill="#e5e7eb" fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Text labels so the split isn't communicated by color alone */}
      <div className="flex justify-between text-xs text-gray-300 mt-1" aria-hidden="true">
        <span className="min-w-0 truncate">{labelA}: {pctA}%</span>
        <span className="min-w-0 truncate text-right">{labelB}: {pctB}%</span>
      </div>
      {!hasPool && (
        <p className="text-xs text-gray-500 mt-1">No bets placed yet — showing an even split.</p>
      )}
    </div>
  );
}
