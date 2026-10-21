/**
 * LoadingSkeleton — #1113
 *
 * Skeleton placeholder variants that match the exact dimensions of the real
 * content they replace, preventing layout shift while data loads.
 *
 * Variants:
 *   "card"   – mirrors MarketCard  (bg-gray-800 rounded-xl p-4 border border-gray-700)
 *   "row"    – mirrors a PortfolioTable row (6 columns, ~h-[52px] per row)
 *   "detail" – mirrors MarketDetailClient sections (fighters + bet history table)
 *   "table"  – generic table rows (legacy, kept for back-compat)
 *   "chart"  – full-width chart area (legacy, kept for back-compat)
 */

export type SkeletonVariant = "card" | "row" | "detail" | "table" | "chart";

export interface LoadingSkeletonProps {
  variant: SkeletonVariant;
  /** Number of repeated items to render (applies to card / row / table). */
  count?: number;
}

// ─── Shared shimmer block ─────────────────────────────────────────────────────

function Shimmer({ className }: { className: string }): JSX.Element {
  return <div className={`animate-pulse bg-gray-700 rounded ${className}`} />;
}

// ─── Card variant ─────────────────────────────────────────────────────────────
// Mirrors MarketCard: rounded-xl p-4 border border-gray-700 bg-gray-800
// Inner structure: title row + weight-class/date line + odds bar

function CardSkeleton(): JSX.Element {
  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
      {/* Title row: fighter names + status badge */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <Shimmer className="h-4 w-3/5" />
        <Shimmer className="h-5 w-14 rounded-full" />
      </div>
      {/* Weight class · date line */}
      <Shimmer className="h-3 w-2/5 mb-3" />
      {/* Odds bar */}
      <Shimmer className="h-4 w-full rounded-full" />
    </div>
  );
}

// ─── Row variant ──────────────────────────────────────────────────────────────
// Mirrors PortfolioTable row: 6 columns (Fight | Side | Amount | Status | Payout | Action)

function RowSkeleton(): JSX.Element {
  return (
    <tr className="bg-gray-900 border-b border-gray-700">
      <td className="px-4 py-3"><Shimmer className="h-4 w-32" /></td>
      <td className="px-4 py-3"><Shimmer className="h-4 w-16" /></td>
      <td className="px-4 py-3"><Shimmer className="h-4 w-20" /></td>
      <td className="px-4 py-3"><Shimmer className="h-5 w-16 rounded-full" /></td>
      <td className="px-4 py-3"><Shimmer className="h-4 w-12" /></td>
      <td className="px-4 py-3"><Shimmer className="h-8 w-20 rounded-lg" /></td>
    </tr>
  );
}

// ─── Detail variant ───────────────────────────────────────────────────────────
// Mirrors MarketDetailClient layout:
//   • header (title + badge)
//   • countdown bar
//   • two fighter cards side-by-side
//   • odds bar
//   • chart area
//   • bet history table header + rows

function DetailSkeleton(): JSX.Element {
  return (
    <div className="space-y-5">
      {/* Header: title + status badge */}
      <div className="flex flex-wrap items-center gap-3">
        <Shimmer className="h-7 w-64" />
        <Shimmer className="h-6 w-20 rounded-full" />
      </div>

      {/* Countdown bar */}
      <Shimmer className="h-6 w-48" />

      {/* Fighter cards */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 bg-gray-800 rounded-xl p-4 border border-gray-700 space-y-2">
          <Shimmer className="h-5 w-32" />
          <Shimmer className="h-4 w-24" />
          <Shimmer className="h-4 w-20" />
          <Shimmer className="h-6 w-full rounded-full mt-2" />
        </div>
        <div className="flex-1 bg-gray-800 rounded-xl p-4 border border-gray-700 space-y-2">
          <Shimmer className="h-5 w-32" />
          <Shimmer className="h-4 w-24" />
          <Shimmer className="h-4 w-20" />
          <Shimmer className="h-6 w-full rounded-full mt-2" />
        </div>
      </div>

      {/* Odds bar */}
      <Shimmer className="h-4 w-full rounded-full" />

      {/* Chart area */}
      <Shimmer className="w-full h-48 rounded-xl" />

      {/* Bet history table */}
      <div className="bg-gray-800 rounded-xl p-4">
        <Shimmer className="h-4 w-36 mb-3" />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                {["w-24", "w-16", "w-20", "w-24"].map((w, i) => (
                  <th key={i} className="pb-2 pr-4 text-left">
                    <Shimmer className={`h-3 ${w}`} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-700">
                  <td className="py-2 pr-4"><Shimmer className="h-4 w-24" /></td>
                  <td className="py-2 pr-4"><Shimmer className="h-4 w-16" /></td>
                  <td className="py-2 pr-4"><Shimmer className="h-4 w-20" /></td>
                  <td className="py-2"><Shimmer className="h-4 w-24" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Table variant (legacy) ───────────────────────────────────────────────────

function TableSkeleton({ count }: { count: number }): JSX.Element {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-gray-800 rounded h-10" />
      ))}
    </div>
  );
}

// ─── Chart variant (legacy) ───────────────────────────────────────────────────

function ChartSkeleton(): JSX.Element {
  return <div className="bg-gray-800 rounded-xl h-48 animate-pulse w-full" />;
}

// ─── Public component ─────────────────────────────────────────────────────────

export function LoadingSkeleton({ variant, count = 1 }: LoadingSkeletonProps): JSX.Element {
  if (variant === "card") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (variant === "row") {
    return (
      <div className="overflow-x-auto rounded-xl border border-gray-700">
        <table className="min-w-full text-sm text-left">
          {/* Column headers mirror PortfolioTable */}
          <thead className="bg-gray-800">
            <tr>
              {["Fight", "Side", "Amount", "Status", "Payout", "Action"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {Array.from({ length: count }).map((_, i) => (
              <RowSkeleton key={i} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (variant === "detail") {
    return <DetailSkeleton />;
  }

  if (variant === "table") {
    return <TableSkeleton count={count} />;
  }

  // chart
  return <ChartSkeleton />;
}
