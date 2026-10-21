import {
  cursorMeta,
  cursorQuerySchema,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  pageMeta,
  pageQuerySchema,
} from "../pagination";

describe("limitSchema (via pageQuerySchema)", () => {
  it("defaults page to 1 and limit to 20", () => {
    expect(pageQuerySchema.parse({})).toEqual({ page: 1, limit: DEFAULT_LIST_LIMIT });
  });

  it("caps limit at 100", () => {
    expect(MAX_LIST_LIMIT).toBe(100);
    expect(pageQuerySchema.parse({ limit: "100" }).limit).toBe(100);
    expect(pageQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it.each(["0", "-5", "abc", "2.5"])("rejects limit=%s", (limit) => {
    expect(pageQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it("applies the same limit rule to cursor feeds", () => {
    expect(cursorQuerySchema.parse({}).limit).toBe(DEFAULT_LIST_LIMIT);
    expect(cursorQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });
});

describe("meta builders", () => {
  it("pageMeta reports hasMore while more rows remain", () => {
    expect(pageMeta(1, 20, 45)).toEqual({ total: 45, hasMore: true });
    expect(pageMeta(3, 20, 45)).toEqual({ total: 45, hasMore: false });
    expect(pageMeta(1, 20, 0)).toEqual({ total: 0, hasMore: false });
  });

  it("cursorMeta exposes nextCursor and hasMore", () => {
    expect(cursorMeta("abc")).toEqual({ hasMore: true, nextCursor: "abc" });
    expect(cursorMeta(null)).toEqual({ hasMore: false, nextCursor: null });
  });
});
