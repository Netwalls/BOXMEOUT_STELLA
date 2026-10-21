import { LoadingSkeleton } from "@/components/LoadingSkeleton";

export default function PortfolioLoading(): JSX.Element {
  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="h-8 w-40 bg-gray-700 rounded animate-pulse" />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-gray-800 rounded-xl p-4 animate-pulse h-24" />
        ))}
      </div>

      {/* Bets table */}
      <LoadingSkeleton variant="row" count={5} />
    </div>
  );
}
