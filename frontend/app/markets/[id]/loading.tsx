import { LoadingSkeleton } from "@/components/LoadingSkeleton";

export default function MarketDetailLoading(): JSX.Element {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <LoadingSkeleton variant="detail" />
    </div>
  );
}
