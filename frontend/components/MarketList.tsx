import { useEffect, useRef } from "react";
import Link from "next/link";
import { Market, MarketStatus } from "@/lib/api";
import MarketCard from "./MarketCard";
import { LoadingSkeleton } from "./LoadingSkeleton";

export interface MarketListProps {
  markets: Market[];
  isLoading: boolean;
  /** Optional status filter — when set, only markets matching this status are shown */
  filter?: MarketStatus;
  /** Whether more markets can be loaded (enables the infinite-scroll sentinel) */
  hasMore?: boolean;
  /** Whether the next page is currently being fetched */
  isLoadingMore?: boolean;
  /** Called when the bottom sentinel enters the viewport */
  onLoadMore?: () => void;
}

const EMPTY_STATE_MESSAGES: Record<MarketStatus, string> = {
  Open: "No open markets right now. Check back soon!",
  Locked: "No locked markets at the moment.",
  Resolved: "No resolved markets yet.",
  Cancelled: "No cancelled markets.",
  Disputed: "No disputed markets.",
};

const EMPTY_STATE_ICONS: Record<MarketStatus, string> = {
  Open: "🥊",
  Locked: "🔒",
  Resolved: "🏆",
  Cancelled: "❌",
  Disputed: "⚠️",
};

export function MarketList({
  markets,
  isLoading,
  filter,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: MarketListProps): JSX.Element {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Load the next page when the bottom sentinel scrolls into view.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !onLoadMore || !hasMore || isLoadingMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMore();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, isLoadingMore]);

  // Show skeleton cards while fetching
  if (isLoading) {
    return <LoadingSkeleton variant="card" count={6} />;
  }

  // Apply filter client-side when provided
  const filtered = filter ? markets.filter((m) => m.status === filter) : markets;

  // Empty state — message and icon vary by active filter
  if (filtered.length === 0) {
    const icon = filter ? EMPTY_STATE_ICONS[filter] : "🥊";
    const message = filter
      ? EMPTY_STATE_MESSAGES[filter]
      : "No markets available yet. Be the first to create one!";

    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-4xl mb-3">🥊</p>
        <p className="mb-6">No {filter?.toLowerCase() ?? "active"} markets yet.</p>
        <Link
          href="/create"
          className="inline-flex items-center px-4 py-2 rounded-md bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold transition-colors"
        >
          Create the first market
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((m) => (
          <MarketCard key={m.id} market={m} showOdds={m.status === "Open"} />
        ))}
      </div>

      {/* Infinite-scroll sentinel + bottom loading indicator */}
      <div ref={sentinelRef} className="flex justify-center py-6" aria-live="polite">
        {isLoadingMore ? (
          <span className="inline-flex items-center gap-2 text-sm text-gray-500">
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-amber-500"
              aria-hidden="true"
            />
            Loading more markets…
          </span>
        ) : hasMore ? (
          <span className="text-sm text-gray-400">Scroll for more</span>
        ) : null}
      </div>
    </div>
  );
}
