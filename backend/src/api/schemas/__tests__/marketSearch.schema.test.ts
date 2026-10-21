import { marketSearchQuerySchema } from "../market.schema";

describe("marketSearchQuerySchema", () => {
  it("accepts a plain query with default paging", () => {
    expect(marketSearchQuerySchema.parse({ q: "fury" })).toEqual({
      q: "fury",
      page: 1,
      limit: 20,
    });
  });

  it("trims whitespace around q", () => {
    expect(marketSearchQuerySchema.parse({ q: "  fury  " }).q).toBe("fury");
  });

  it.each([undefined, "", "   "])("rejects missing or blank q (%p)", (q) => {
    const result = marketSearchQuerySchema.safeParse({ q });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("q is required");
    }
  });

  it("accepts q of exactly 100 characters", () => {
    expect(marketSearchQuerySchema.safeParse({ q: "a".repeat(100) }).success).toBe(true);
  });

  it("rejects q longer than 100 characters", () => {
    const result = marketSearchQuerySchema.safeParse({ q: "a".repeat(101) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("q must be at most 100 characters");
    }
  });

  it("keeps operator and quote characters so websearch syntax still works", () => {
    const q = '"fury vs" -wilder or chess';
    expect(marketSearchQuerySchema.parse({ q }).q).toBe(q);
  });

  it("applies the shared limit cap to search", () => {
    expect(marketSearchQuerySchema.safeParse({ q: "x", limit: "100" }).success).toBe(true);
    expect(marketSearchQuerySchema.safeParse({ q: "x", limit: "101" }).success).toBe(false);
  });
});
