import { LoadingSkeleton } from "@/components/LoadingSkeleton";

export default function HomeLoading(): JSX.Element {
  return (
    <main className="container mx-auto px-4 py-8 min-h-screen">
      {/* Hero placeholder */}
      <div className="mb-10 text-center space-y-3 flex flex-col items-center animate-pulse">
        <div className="h-10 w-48 bg-gray-700 rounded" />
        <div className="h-4 w-80 bg-gray-700 rounded" />
        <div className="h-10 w-36 bg-gray-700 rounded-lg" />
      </div>

      {/* Filter bar placeholder */}
      <div className="flex gap-2 mb-6 animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-20 bg-gray-700 rounded-full" />
        ))}
      </div>

      {/* Market cards grid */}
      <LoadingSkeleton variant="card" count={6} />
    </main>
  );
}
