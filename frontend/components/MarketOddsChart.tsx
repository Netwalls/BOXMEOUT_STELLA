"use client";
import { useEffect, useId, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { OddsSnapshot } from "@/lib/api";
import { useMarketOddsHistory } from "@/hooks/useMarketOddsHistory";
import {
  DEFAULT_ODDS_RANGE,
  ODDS_RANGES,
  ODDS_RANGE_LABELS,
  ODDS_RANGE_PARAM,
  isOddsRange,
  isOddsRangeAvailable,
} from "@/lib/oddsRange";
import type { OddsRange } from "@/lib/oddsRange";

export interface MarketOddsChartProps {
  marketId: string;
  historicalOdds: OddsSnapshot[];
}

function formatChange(delta: number): string {
  const rounded = Math.round(delta * 10) / 10;
  if (rounded === 0) return "unchanged";
  return `${rounded > 0 ? "+" : ""}${rounded} points`;
}

export function MarketOddsChart({ marketId, historicalOdds }: MarketOddsChartProps): JSX.Element {
  const [selectedRange, setSelectedRange] = useState<OddsRange>(DEFAULT_ODDS_RANGE);
  const [showTable, setShowTable] = useState<boolean>(false);
  const tableId = useId();
  const groupName = useId();

  // Read the range from the URL after mount so server and client markup match.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get(ODDS_RANGE_PARAM);
    if (isOddsRange(fromUrl)) setSelectedRange(fromUrl);
  }, []);

  const availability = useMemo(
    () =>
      Object.fromEntries(
        ODDS_RANGES.map((r) => [r, isOddsRangeAvailable(historicalOdds, r)])
      ) as Record<OddsRange, boolean>,
    [historicalOdds]
  );

  // A range with no points cannot be shown; fall back to the full history.
  const activeRange: OddsRange = availability[selectedRange] ? selectedRange : DEFAULT_ODDS_RANGE;

  const { snapshots } = useMarketOddsHistory(marketId, {
    range: activeRange,
    initialSnapshots: historicalOdds,
  });

  if (historicalOdds.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-800 rounded-xl text-gray-500 text-sm">
        No odds data yet
      </div>
    );
  }

  const selectRange = (next: OddsRange) => {
    setSelectedRange(next);
    try {
      const url = new URL(window.location.href);
      if (next === DEFAULT_ODDS_RANGE) url.searchParams.delete(ODDS_RANGE_PARAM);
      else url.searchParams.set(ODDS_RANGE_PARAM, next);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      // URL update is best effort; the selection still applies in memory.
    }
  };

  const rangeControl = (
    <fieldset className="mb-2">
      <legend className="sr-only">Odds timeframe</legend>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Odds timeframe">
        {ODDS_RANGES.map((r) => {
          const id = `${groupName}-${r}`;
          const disabled = !availability[r];
          return (
            <span key={r} className="contents">
              <input
                type="radio"
                id={id}
                name={groupName}
                value={r}
                className="peer sr-only"
                checked={activeRange === r}
                disabled={disabled}
                onChange={() => selectRange(r)}
              />
              <label
                htmlFor={id}
                title={ODDS_RANGE_LABELS[r]}
                className={`px-2 py-1 rounded-md text-xs border border-gray-600 text-gray-300 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400 ${
                  disabled
                    ? "opacity-40 cursor-not-allowed"
                    : "cursor-pointer peer-checked:bg-blue-600 peer-checked:text-white peer-checked:border-blue-600"
                }`}
              >
                {r}
                {disabled && <span className="sr-only"> (no data in this range)</span>}
              </label>
            </span>
          );
        })}
      </div>
    </fieldset>
  );

  if (snapshots.length === 0) {
    return (
      <div className="w-full bg-gray-800 rounded-xl p-3">
        {rangeControl}
        <div className="flex items-center justify-center h-48 rounded-xl text-gray-500 text-sm">
          No odds data in this range
        </div>
      </div>
    );
  }

  const data = snapshots.map((s) => ({
    t: new Date(s.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    A: s.oddsA,
    B: s.oddsB,
  }));

  // For a single data point render dots; for multiple render lines without dots
  const isSinglePoint = data.length === 1;

  const open = historicalOdds[0];
  const latest = historicalOdds[historicalOdds.length - 1];
  // Unreachable once the empty check above has run; kept so the indexed reads are narrowed.
  if (!open || !latest) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-800 rounded-xl text-gray-500 text-sm">
        No odds data yet
      </div>
    );
  }
  const summary =
    `${prefix}Current odds: Fighter A ${latest.oddsA}%, Fighter B ${latest.oddsB}%. ` +
    `Change since ${sinceText}: Fighter A ${formatChange(latest.oddsA - open.oddsA)}, ` +
    `Fighter B ${formatChange(latest.oddsB - open.oddsB)}.`;

  return (
    <div className="w-full bg-gray-800 rounded-xl p-3">
      {rangeControl}
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
              <th scope="col" className="text-left">
                Time
              </th>
              <th scope="col" className="text-right">
                Fighter A
              </th>
              <th scope="col" className="text-right">
                Fighter B
              </th>
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
