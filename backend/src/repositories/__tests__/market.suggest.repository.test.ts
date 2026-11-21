/**
 * B-158: suggestion query. Prisma and Redis are mocked, so no DB is needed.
 */
const mockQueryRaw = jest.fn();
// Mock the db module directly: importing it would load the full env config.
jest.mock("../../db", () => ({
  db: { $queryRaw: (...args: unknown[]) => mockQueryRaw(...args) },
}));

const mockGet = jest.fn();
const mockSetex = jest.fn();
jest.mock("ioredis", () =>
  jest.fn().mockImplementation(() => ({ get: mockGet, setex: mockSetex })),
);

import { escapeLikePattern, suggestMarkets } from "../market.repository";

/** Returns the SQL text and bound values of the nth $queryRaw call. */
function callParts(index: number): { sql: string; values: unknown[] } {
  const [strings, ...values] = mockQueryRaw.mock.calls[index] as [TemplateStringsArray, ...unknown[]];
  return { sql: Array.from(strings).join("?"), values };
}

describe("escapeLikePattern", () => {
  it("escapes %, _ and the backslash escape character itself", () => {
    expect(escapeLikePattern("50%_off\\x")).toBe("50\\%\\_off\\\\x");
  });

  it("leaves ordinary text unchanged", () => {
    expect(escapeLikePattern("fury wilder")).toBe("fury wilder");
  });
});

describe("suggestMarkets", () => {
  beforeEach(() => {
    mockGet.mockResolvedValue(null);
    mockSetex.mockResolvedValue("OK");
    mockQueryRaw.mockResolvedValue([]);
  });

  it("binds user input as parameters and never interpolates it into SQL", async () => {
    await suggestMarkets("a'; DROP TABLE \"Market\"; --");

    const { sql, values } = callParts(0);
    expect(sql).not.toContain("DROP TABLE");
    expect(values.some((v) => typeof v === "string" && v.includes("drop table"))).toBe(true);
  });

  it("escapes LIKE wildcards in the bound pattern so % and _ match literally", async () => {
    await suggestMarkets("100%_");

    const { values } = callParts(0);
    expect(values).toContain("100\\%\\_%");
    expect(values).toContain("% 100\\%\\_%");
  });

  it("is case-insensitive and trims the query before caching and matching", async () => {
    await suggestMarkets("  FURY  ");

    expect(mockGet).toHaveBeenCalledWith("suggest:fury");
    expect(callParts(0).values).toContain("fury%");
  });

  it("returns the cached result without querying the database", async () => {
    const cached = [{ id: "m1", label: "Cached question" }];
    mockGet.mockResolvedValue(JSON.stringify(cached));

    await expect(suggestMarkets("fury")).resolves.toEqual(cached);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it("caches fresh results for 10 seconds", async () => {
    mockQueryRaw.mockResolvedValue([
      { id: "m1", question: "Fury vs Usyk", fighterAName: "Fury", fighterBName: "Usyk" },
    ]);

    await suggestMarkets("fury");

    expect(mockSetex).toHaveBeenCalledWith(
      "suggest:fury",
      10,
      JSON.stringify([{ id: "m1", label: "Fury vs Usyk" }]),
    );
  });

  it("caps the result set at 8 rows in SQL", async () => {
    await suggestMarkets("fury");

    const { sql, values } = callParts(0);
    expect(sql).toMatch(/LIMIT\s+\?/);
    expect(values).toContain(8);
  });

  it("labels with the question when the question matches", async () => {
    mockQueryRaw.mockResolvedValue([
      { id: "m1", question: "Will Fury win?", fighterAName: "Fury", fighterBName: "Usyk" },
    ]);

    await expect(suggestMarkets("will")).resolves.toEqual([{ id: "m1", label: "Will Fury win?" }]);
  });

  it("labels with the matching fighter name when only a fighter matches", async () => {
    mockQueryRaw.mockResolvedValue([
      { id: "m2", question: "Heavyweight title", fighterAName: "Anthony Joshua", fighterBName: "Usyk" },
    ]);

    await expect(suggestMarkets("usy")).resolves.toEqual([{ id: "m2", label: "Usyk" }]);
  });

  it("matches a word that begins inside a question", async () => {
    mockQueryRaw.mockResolvedValue([
      { id: "m3", question: "Big fight tonight", fighterAName: null, fighterBName: null },
    ]);

    await expect(suggestMarkets("fight")).resolves.toEqual([{ id: "m3", label: "Big fight tonight" }]);
  });

  it("handles very long input by passing it through as a bound value", async () => {
    const long = "x".repeat(5000);
    await suggestMarkets(long);

    expect(callParts(0).values).toContain(`${long}%`);
  });
});
