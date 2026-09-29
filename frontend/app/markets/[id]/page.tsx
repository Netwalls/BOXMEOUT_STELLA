import type { Metadata } from "next";
import { fetchMarketById, fetchMarketBets, fetchOddsHistory } from "@/lib/api";
import { MarketDetailClient } from "@/components/MarketDetailClient";
import { notFound } from "next/navigation";

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const market = await fetchMarketById(params.id).catch(() => null);
  if (!market) {
    return { title: "Market Not Found — BOXMEOUT" };
  }

  const { fighterA, fighterB, scheduledAt } = market;
  const date = new Date(scheduledAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const title = `${fighterA.name} vs ${fighterB.name} — BOXMEOUT`;
  const description = `${fighterA.weightClass} bout on ${date}. Place your XLM prediction on-chain — no middlemen.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function MarketDetailPage({ params }: Props): Promise<JSX.Element> {
  const [market, bets, oddsHistory] = await Promise.all([
    fetchMarketById(params.id).catch(() => null),
    fetchMarketBets(params.id).catch(() => []),
    fetchOddsHistory(params.id).catch(() => []),
  ]);

  if (!market) notFound();

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <MarketDetailClient
        marketId={params.id}
        initialMarket={market}
        initialBets={bets}
        initialOddsHistory={oddsHistory}
      />
    </div>
  );
}
