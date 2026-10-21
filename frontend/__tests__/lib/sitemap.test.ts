import { buildSitemapEntries } from "@/lib/sitemap";

const NOW = new Date("2026-10-19T00:00:00Z");

describe("buildSitemapEntries", () => {
  it("lists the home page first, at the site origin", () => {
    const entries = buildSitemapEntries("https://boxmeout.example/some/path", [], NOW);

    expect(entries).toEqual([
      { url: "https://boxmeout.example/", lastModified: NOW, changeFrequency: "hourly", priority: 1 },
    ]);
  });

  it("adds one absolute URL per open market", () => {
    const entries = buildSitemapEntries(
      "https://boxmeout.example",
      [{ id: "m-1", scheduledAt: "2026-11-01T00:00:00Z" }],
      NOW
    );

    expect(entries[1]).toEqual({
      url: "https://boxmeout.example/markets/m-1",
      lastModified: new Date("2026-11-01T00:00:00Z"),
      changeFrequency: "hourly",
      priority: 0.8,
    });
  });

  it("encodes market ids so they cannot change the path", () => {
    const entries = buildSitemapEntries(
      "https://boxmeout.example",
      [{ id: "a/b?c", scheduledAt: "2026-11-01T00:00:00Z" }],
      NOW
    );

    expect(entries[1].url).toBe("https://boxmeout.example/markets/a%2Fb%3Fc");
  });

  it("rejects a site URL that is not absolute", () => {
    expect(() => buildSitemapEntries("boxmeout.example", [], NOW)).toThrow();
  });
});
