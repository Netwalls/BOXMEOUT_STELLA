"use client";
import { useId, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { OddsSnapshot } from "@/lib/api";

export interface MarketOddsChartProps {
  marketId: string;
  historicalOdds: OddsSnapshot[];
}

function formatChange(delta: number): string {
  const rounded = Math.round(delta * 10) / 10;
  if (rounded === 0) return "unchanged";
  return `${rounded > 0 ? "+" : ""}${rounded} points`;
}

export function MarketOddsChart({ historicalOdds }: MarketOddsChartProps): JSX.Element {
  const [showTable, setShowTable] = useState<boolean>(false);
  const tableId = useId();

  if (historicalOdds.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-800 rounded-xl text-gray-500 text-sm">
        No odds data yet
      </div>
    );
  }

  const data = historicalOdds.map((s) => ({
    t: new Date(s.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    A: s.oddsA,
    B: s.oddsB,
  }));

  // For a single data point render dots; for multiple render lines without dots
  const isSinglePoint = data.length === 1;

  const open = historicalOdds[0];
  const latest = historicalOdds[historicalOdds.length - 1];
  const summary =
    `Current odds: Fighter A ${latest.oddsA}%, Fighter B ${latest.oddsB}%. ` +
    `Change since open: Fighter A ${formatChange(latest.oddsA - open.oddsA)}, ` +
    `Fighter B ${formatChange(latest.oddsB - open.oddsB)}.`;

  return (
    <div className="w-full bg-gray-800 rounded-xl p-3">
      <p className="sr-only">{summary}</p>
      <div className="w-full h-48" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis dataKey="t" tick={{ fill: "#9ca3af", fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fill: "#9ca3af", fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: "#1f2937", border: "none", fontSize: 12 }}
              formatter={(value: number, name: string) => [`${value}%`, name]}
            />
            <Line
              type="monotone"
              dataKey="A"
              stroke="#3b82f6"
              dot={isSinglePoint}
              strokeWidth={2}
              name="Fighter A"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="B"
              stroke="#ef4444"
              dot={isSinglePoint}
              strokeWidth={2}
              name="Fighter B"
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <button
        type="button"
        className="mt-2 text-xs text-gray-300 underline"
        aria-expanded={showTable}
        aria-controls={tableId}
        onClick={() => setShowTable((prev) => !prev)}
      >
        {showTable ? "Hide data table" : "Show data table"}
      </button>
      {showTable && (
        <table id={tableId} className="mt-2 w-full text-xs text-gray-300">
          <caption className="sr-only">Odds history</caption>
          <thead>
            <tr>
              <th scope="col" className="text-left">Time</th>
              <th scope="col" className="text-right">Fighter A</th>
              <th scope="col" className="text-right">Fighter B</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={`${row.t}-${i}`}>
                <td>{row.t}</td>
                <td className="text-right">{row.A}%</td>
                <td className="text-right">{row.B}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
