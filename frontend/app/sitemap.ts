import type { MetadataRoute } from "next";
import { fetchMarkets } from "@/lib/api";
import { buildSitemapEntries } from "@/lib/sitemap";
import { SITE_URL } from "@/lib/config";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // The sitemap is still useful without markets, so an API outage yields just the home page
  const openMarkets = await fetchMarkets({ status: "Open", limit: 500 }).catch(() => []);
  return buildSitemapEntries(SITE_URL, openMarkets);
}
