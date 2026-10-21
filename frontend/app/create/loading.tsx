export default function CreateMarketLoading(): JSX.Element {
  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-6 animate-pulse">
      {/* Page title */}
      <div className="h-8 w-40 bg-gray-700 rounded" />

      {/* Form fields */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-24 bg-gray-700 rounded" />
          <div className="h-10 w-full bg-gray-800 rounded-lg border border-gray-700" />
        </div>
      ))}

      {/* Submit button */}
      <div className="h-11 w-full bg-gray-700 rounded-lg" />
    </div>
  );
}
