import {
  decodeBetCursor,
  encodeBetCursor,
  normalizeBetLimit,
  DEFAULT_BET_PAGE_LIMIT,
  MAX_BET_PAGE_LIMIT,
} from "../bet.service";

describe("bet cursor helpers", () => {
  it("round-trips a (placedAt, id) cursor", () => {
    const cursor = { placedAt: new Date("2030-01-02T03:04:05.000Z"), id: "bet-42" };
    const decoded = decodeBetCursor(encodeBetCursor(cursor));

    expect(decoded).toEqual(cursor);
  });

  it.each([undefined, null, "", "not-base64-json", Buffer.from("{}").toString("base64url")])(
    "treats malformed or missing cursor %p as null",
    (value) => {
      expect(decodeBetCursor(value)).toBeNull();
    },
  );

  it("rejects a cursor with an invalid date", () => {
    const bad = Buffer.from(JSON.stringify({ placedAt: "nope", id: "x" })).toString("base64url");
    expect(decodeBetCursor(bad)).toBeNull();
  });

  it("normalizes limits into [1, 100] with a default of 20", () => {
    expect(MAX_BET_PAGE_LIMIT).toBe(100);
    expect(normalizeBetLimit(undefined)).toBe(DEFAULT_BET_PAGE_LIMIT);
    expect(normalizeBetLimit("0")).toBe(DEFAULT_BET_PAGE_LIMIT);
    expect(normalizeBetLimit("500")).toBe(100);
    expect(normalizeBetLimit(7)).toBe(7);
  });
});
