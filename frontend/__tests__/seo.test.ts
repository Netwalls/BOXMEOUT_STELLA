import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import manifest from "@/app/manifest";
import { metadata as rootMetadata } from "@/app/layout";
import { generateMetadata as generateMarketMetadata } from "@/app/markets/[id]/page";
import * as api from "@/lib/api";
import { SITE_URL } from "@/lib/config";

jest.mock("@/lib/api");

const mockFetchMarkets = api.fetchMarkets as jest.MockedFunction<typeof api.fetchMarkets>;
const mockFetchMarketById = api.fetchMarketById as jest.MockedFunction<typeof api.fetchMarketById>;

describe("SEO & Metadata (F-103)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("robots.ts", () => {
    it("returns valid robots.txt configuration with sitemap reference", () => {
      const result = robots();
      expect(result).toBeDefined();
      expect(result.rules).toMatchObject({
        userAgent: "*",
        allow: "/",
      });
      expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    });
  });

  describe("sitemap.ts", () => {
    it("lists static pages and dynamic open markets from API", async () => {
      const mockOpenMarkets = [
        {
          id: "market-101",
          contractAddress: "CA101",
          fighterA: { name: "Tyson", record: "50-6", nationality: "USA", weightClass: "Heavyweight" },
          fighterB: { name: "Paul", record: "10-1", nationality: "USA", weightClass: "Heavyweight" },
          scheduledAt: "2026-11-15T22:00:00Z",
          bettingEndsAt: "2026-11-15T21:00:00Z",
          status: "Open" as const,
          outcome: null,
          poolA: "1000",
          poolB: "2000",
          totalPool: "3000",
          oracleAddress: "GORACLE",
          createdBy: "GCREATOR",
        },
      ];

      mockFetchMarkets.mockResolvedValueOnce(mockOpenMarkets);

      const entries = await sitemap();

      expect(mockFetchMarkets).toHaveBeenCalledWith({ status: "Open" });

      const urls = entries.map((e) => e.url);
      const cleanBase = SITE_URL.replace(/\/+$/, "");

      // Static routes
      expect(urls).toContain(cleanBase);
      expect(urls).toContain(`${cleanBase}/create`);
      expect(urls).toContain(`${cleanBase}/portfolio`);

      // Dynamic open market
      expect(urls).toContain(`${cleanBase}/markets/market-101`);

      const marketEntry = entries.find((e) => e.url.includes("market-101"));
      expect(marketEntry?.priority).toBe(0.8);
      expect(marketEntry?.changeFrequency).toBe("hourly");
    });

    it("falls back gracefully to static pages if API fails", async () => {
      mockFetchMarkets.mockRejectedValueOnce(new Error("API offline"));

      const entries = await sitemap();
      const urls = entries.map((e) => e.url);
      const cleanBase = SITE_URL.replace(/\/+$/, "");

      expect(urls).toContain(cleanBase);
      expect(urls).toContain(`${cleanBase}/create`);
      expect(urls).toContain(`${cleanBase}/portfolio`);
      expect(urls.length).toBe(3);
    });
  });

  describe("manifest.ts", () => {
    it("returns complete web app manifest metadata", () => {
      const result = manifest();
      expect(result.name).toBe("BOXMEOUT — Boxing Prediction Market");
      expect(result.short_name).toBe("BOXMEOUT");
      expect(result.start_url).toBe("/");
      expect(result.display).toBe("standalone");
      expect(result.background_color).toBe("#111827");
      expect(result.theme_color).toBe("#F59E0B");
      expect(Array.isArray(result.icons)).toBe(true);
      expect(result.icons?.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("RootLayout metadataBase", () => {
    it("defines valid metadataBase and OpenGraph defaults in layout", () => {
      expect(rootMetadata.metadataBase).toBeInstanceOf(URL);
      expect(rootMetadata.metadataBase?.toString()).toBe(new URL(SITE_URL).toString());
      expect(rootMetadata.title).toBeDefined();
      expect(rootMetadata.description).toBeDefined();
      expect(rootMetadata.openGraph).toBeDefined();
      expect(rootMetadata.twitter).toBeDefined();
      expect(rootMetadata.manifest).toBe("/manifest.webmanifest");
    });
  });

  describe("Market page social card metadata", () => {
    it("generates OpenGraph and Twitter card metadata for a market URL", async () => {
      const mockMarket = {
        id: "market-555",
        contractAddress: "CA555",
        fighterA: { name: "Canelo Alvarez", record: "60-2-2", nationality: "Mexico", weightClass: "Super Middleweight" },
        fighterB: { name: "Terence Crawford", record: "40-0", nationality: "USA", weightClass: "Super Middleweight" },
        scheduledAt: "2026-12-05T20:00:00Z",
        bettingEndsAt: "2026-12-05T19:00:00Z",
        status: "Open" as const,
        outcome: null,
        poolA: "5000",
        poolB: "5000",
        totalPool: "10000",
        oracleAddress: "GORACLE",
        createdBy: "GCREATOR",
      };

      mockFetchMarketById.mockResolvedValueOnce(mockMarket);

      const meta = await generateMarketMetadata({ params: { id: "market-555" } });

      expect(meta.title).toContain("Canelo Alvarez vs Terence Crawford");
      expect(meta.openGraph?.title).toContain("Canelo Alvarez vs Terence Crawford");
      expect(meta.twitter?.card).toBe("summary_large_image");
    });

    it("handles non-existent market in metadata generation", async () => {
      mockFetchMarketById.mockRejectedValueOnce(new Error("Not found"));

      const meta = await generateMarketMetadata({ params: { id: "non-existent" } });

      expect(meta.title).toBe("Market Not Found — BOXMEOUT");
    });
  });
});
