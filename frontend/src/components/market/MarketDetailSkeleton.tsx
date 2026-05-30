export function MarketDetailSkeleton(): JSX.Element {
  return (
    <main className="max-w-4xl mx-auto px-4 py-6 space-y-6 animate-pulse">
      {/* Badges + title */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="h-5 w-16 bg-gray-700 rounded-full" />
          <div className="h-5 w-24 bg-gray-700 rounded-full" />
        </div>
        <div className="h-7 w-3/4 bg-gray-700 rounded" />
        <div className="h-4 w-40 bg-gray-800 rounded" />
        <div className="h-4 w-28 bg-gray-800 rounded" />
      </div>

      {/* Odds bar */}
      <div className="space-y-2">
        <div className="h-8 w-full bg-gray-700 rounded" />
        <div className="flex justify-between">
          <div className="h-3 w-28 bg-gray-800 rounded" />
          <div className="h-3 w-20 bg-gray-800 rounded" />
          <div className="h-3 w-28 bg-gray-800 rounded" />
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* BetPanel skeleton */}
        <div className="lg:col-start-3 bg-gray-900 rounded-xl p-6 space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 h-11 bg-gray-700 rounded-lg" />
            <div className="flex-1 h-11 bg-gray-700 rounded-lg" />
            <div className="flex-1 h-11 bg-gray-700 rounded-lg" />
          </div>
          <div className="h-9 w-full bg-gray-700 rounded-lg" />
          <div className="h-16 w-full bg-gray-800 rounded-lg" />
          <div className="h-11 w-full bg-gray-700 rounded-lg" />
        </div>

        {/* Recent bets skeleton */}
        <div className="lg:col-span-2 lg:row-start-1 space-y-3">
          <div className="h-5 w-28 bg-gray-700 rounded" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 border-b border-gray-800/50 pb-3">
              <div className="h-4 w-20 bg-gray-700 rounded" />
              <div className="h-4 w-16 bg-gray-700 rounded" />
              <div className="h-4 w-16 bg-gray-700 rounded" />
              <div className="h-4 w-12 bg-gray-800 rounded" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
