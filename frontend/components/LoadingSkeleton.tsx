export interface LoadingSkeletonProps {
  variant: "card" | "table" | "chart";
  count?: number;
}

export function LoadingSkeleton({ variant, count = 1 }: LoadingSkeletonProps): JSX.Element {
  const items = Array.from({ length: count });

  if (variant === "card") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((_, i) => (
          <div key={i} className="bg-gray-800 rounded-xl p-4 animate-pulse h-40" />
        ))}
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className="space-y-2 animate-pulse">
        {items.map((_, i) => (
          <div key={i} className="bg-gray-800 rounded h-10" />
        ))}
      </div>
    );
  }

  // chart
  return <div className="bg-gray-800 rounded-xl h-48 animate-pulse w-full" />;
}
