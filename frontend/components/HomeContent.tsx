"use client";

import { useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMarkets } from "@/hooks/useMarkets";
import { MarketFilterBar, STATUS_TABS, StatusTab } from "@/components/MarketFilterBar";
import { MarketList } from "@/components/MarketList";
import { MarketStatus } from "@/lib/api";

function parseStatusTab(value: string | null): StatusTab {
  if (STATUS_TABS.includes(value as StatusTab)) return value as StatusTab;
  return "All";
}

/**
 * Inner component that reads searchParams — must be wrapped in Suspense
 * because useSearchParams() needs it in Next.js App Router.
 */
function HomeInner(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusTab = parseStatusTab(searchParams.get("status"));
  const weightClass = searchParams.get("weightClass") ?? "";

  // Build API filters — only pass status when it's not "All"
  const filters = useMemo(
    () => ({
      ...(statusTab !== "All" ? { status: statusTab as MarketStatus } : {}),
      ...(weightClass ? { weightClass } : {}),
    }),
    [statusTab, weightClass]
  );

  const { markets, isLoading, error } = useMarkets(filters);

  // Build weight-class options from loaded markets
  const weightClasses = useMemo(() => {
    const seen = new Set<string>();
    for (const m of markets) {
      seen.add(m.fighterA.weightClass);
      seen.add(m.fighterB.weightClass);
    }
    return Array.from(seen).sort();
  }, [markets]);

  // Update URL params without full page reload
  const updateURL = useCallback(
    (nextStatus: StatusTab, nextWeightClass: string) => {
      const params = new URLSearchParams();
      if (nextStatus !== "All") params.set("status", nextStatus);
      if (nextWeightClass) params.set("weightClass", nextWeightClass);
      const qs = params.toString();
      router.push(qs ? `/?${qs}` : "/", { scroll: false });
    },
    [router]
  );

  return (
    <>
      {/* Hero section */}
      <section className="mb-10 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-3">
          BOXMEOUT
        </h1>
        <p className="text-gray-400 text-lg max-w-xl mx-auto mb-6">
          Decentralized prediction markets for boxing. Place XLM bets on-chain — no middlemen, no custody.
        </p>
        {/* Create Market CTA */}
        <Link
          href="/create"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Market
        </Link>
      </section>

      {/* Filters */}
      <MarketFilterBar
        statusTab={statusTab}
        weightClass={weightClass}
        weightClasses={weightClasses}
        onStatusChange={(s) => updateURL(s, weightClass)}
        onWeightClassChange={(wc) => updateURL(statusTab, wc)}
      />

      {/* Error state */}
      {error && (
        <div
          role="alert"
          className="mb-6 px-4 py-3 rounded-md bg-red-900/60 border border-red-700 text-red-300 text-sm"
        >
          Failed to load markets: {error.message}
        </div>
      )}

      {/* Market grid — passes the filter so MarketList can show the right empty message */}
      <MarketList
        markets={markets}
        isLoading={isLoading}
        filter={statusTab !== "All" ? (statusTab as MarketStatus) : undefined}
      />
    </>
  );
}

export function HomeContent(): JSX.Element {
  return (
    <main className="container mx-auto px-4 py-8 min-h-screen">
      <Suspense fallback={null}>
        <HomeInner />
      </Suspense>
    </main>
  );
}
