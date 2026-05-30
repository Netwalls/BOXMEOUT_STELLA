export function BetHistoryTableSkeleton({ rows = 5 }: { rows?: number }): JSX.Element {
  return (
    <div className="overflow-x-auto -mx-4 px-4 animate-pulse">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            {['Market', 'Side', 'Amount (XLM)', 'Status', 'Payout (XLM)', 'Action'].map((col) => (
              <th key={col} className="pb-2 pr-4 whitespace-nowrap">
                <div className="h-3 w-16 bg-gray-700 rounded" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i} className="border-b border-gray-800/50">
              <td className="py-3 pr-4"><div className="h-4 w-20 bg-gray-700 rounded" /></td>
              <td className="py-3 pr-4"><div className="h-4 w-16 bg-gray-700 rounded" /></td>
              <td className="py-3 pr-4"><div className="h-4 w-16 bg-gray-700 rounded" /></td>
              <td className="py-3 pr-4"><div className="h-4 w-14 bg-gray-700 rounded" /></td>
              <td className="py-3 pr-4"><div className="h-4 w-16 bg-gray-700 rounded" /></td>
              <td className="py-3"><div className="h-8 w-16 bg-gray-700 rounded-lg" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
