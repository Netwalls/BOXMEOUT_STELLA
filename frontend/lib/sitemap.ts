import type { MetadataRoute } from "next";
import type { Market } from "@/lib/api";

/**
 * Sitemap entries for the home page and every open market. Market URLs are
 * joined onto the site origin so the sitemap always holds absolute links.
 */
export function buildSitemapEntries(
  siteUrl: string,
  markets: Pick<Market, "id" | "scheduledAt">[],
  now: Date = new Date()
): MetadataRoute.Sitemap {
  const origin = new URL(siteUrl).origin;

  return [
    { url: `${origin}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    ...markets.map((market) => ({
      url: `${origin}/markets/${encodeURIComponent(market.id)}`,
      lastModified: new Date(market.scheduledAt),
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
  ];
}
