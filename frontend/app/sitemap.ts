import type { MetadataRoute } from 'next';
import { fetchMarkets } from '@/lib/api';
import { SITE_URL } from '@/lib/config';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SITE_URL.replace(/\/+$/, '');

  let marketEntries: MetadataRoute.Sitemap = [];
  try {
    const markets = await fetchMarkets({ status: 'Open' });
    if (Array.isArray(markets)) {
      marketEntries = markets.map((market) => ({
        url: `${baseUrl}/markets/${market.id}`,
        lastModified: market.scheduledAt ? new Date(market.scheduledAt) : new Date(),
        changeFrequency: 'hourly' as const,
        priority: 0.8,
      }));
    }
  } catch {
    marketEntries = [];
  }

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 1.0,
    },
    {
      url: `${baseUrl}/create`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    },
    {
      url: `${baseUrl}/portfolio`,
      lastModified: new Date(),
      changeFrequency: 'hourly' as const,
      priority: 0.7,
    },
  ];

  return [...staticEntries, ...marketEntries];
}
