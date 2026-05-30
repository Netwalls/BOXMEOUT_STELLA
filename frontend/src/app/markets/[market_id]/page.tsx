// ============================================================
// BOXMEOUT — Market Detail Page (/markets/[market_id])
// ============================================================

import type { Metadata } from 'next';
import { ErrorBoundary } from '../../../components/ui/ErrorBoundary';
import MarketDetailContent from './MarketDetailContent';
import { fetchMarketById } from '../../../services/api';

interface MarketDetailPageProps {
  params: { market_id: string };
}

export async function generateMetadata({ params }: MarketDetailPageProps): Promise<Metadata> {
  try {
    const market = await fetchMarketById(params.market_id);
    const title = `${market.fighter_a} vs ${market.fighter_b}`;
    const description = `Bet on ${market.fighter_a} vs ${market.fighter_b} — ${market.weight_class}${market.title_fight ? ' Title Fight' : ''} on BoxMeOut.`;
    return {
      title,
      description,
      openGraph: {
        title: `${title} — BoxMeOut`,
        description,
        type: 'website',
      },
    };
  } catch {
    return { title: 'Market' };
  }
}

export default function MarketDetailPage({ params }: MarketDetailPageProps): JSX.Element {
  return (
    <ErrorBoundary>
      <MarketDetailContent market_id={params.market_id} />
    </ErrorBoundary>
  );
}
