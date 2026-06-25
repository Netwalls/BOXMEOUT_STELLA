"use client";
import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMarkets } from "@/hooks/useMarkets";
import { MarketFilterBar, STATUS_TABS, StatusTab } from "@/components/MarketFilterBar";
import { MarketList } from "@/components/MarketList";
import { MarketStatus } from "@/lib/api";

function parseStatusTab(value: string | null): StatusTab {
  if (STATUS_TABS.includes(value as StatusTab)) return value as StatusTab;
  return "All";
}

export function HomeContent(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusTab = parseStatusTab(searchParams.get("status"));
  const weightClass = searchParams.get("weightClass") ?? "";

  const filters = useMemo(
    () => ({
      ...(statusTab !== "All" ? { status: statusTab as MarketStatus } : {}),
      ...(weightClass ? { weightClass } : {}),
    }),
    [statusTab, weightClass]
  );

  const { markets, isLoading } = useMarkets(filters);

  const weightClasses = useMemo(() => {
    const seen = new Set<string>();
    for (const m of markets) {
      seen.add(m.fighterA.weightClass);
      seen.add(m.fighterB.weightClass);
    }
    return Array.from(seen).sort();
  }, [markets]);

  const updateURL = useCallback(
    (nextStatus: StatusTab, nextWeightClass: string) => {
      const params = new URLSearchParams();
      if (nextStatus !== "All") params.set("status", nextStatus);
      if (nextWeightClass) params.set("weightClass", nextWeightClass);
      const qs = params.toString();
      router.push(qs ? `/?${qs}` : "/");
    },
    [router]
  );

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Markets</h1>
      <MarketFilterBar
        statusTab={statusTab}
        weightClass={weightClass}
        weightClasses={weightClasses}
        onStatusChange={(s) => updateURL(s, weightClass)}
        onWeightClassChange={(wc) => updateURL(statusTab, wc)}
      />
      <MarketList markets={markets} isLoading={isLoading} />
    </main>
  );
}
