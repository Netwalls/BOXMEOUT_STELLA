/**
 * Unit tests for GET /api/users/:address/activity (#1588, B-152).
 * The database is mocked; ordering and cursor SQL are covered by
 * user.activity.integration.test.ts.
 */
import type { Request, Response } from "express";
import { db } from "../src/db";
import {
  decodeActivityCursor,
  encodeActivityCursor,
  getUserActivity,
  InvalidActivityCursorError,
  normalizeActivityLimit,
  ACTIVITY_MAX_LIMIT,
} from "../src/services/user.service";
import { getUserActivityHandler } from "../src/api/controllers/user.controller";

jest.mock("../src/db", () => ({
  db: { $queryRaw: jest.fn() },
}));

const queryRaw = db.$queryRaw as unknown as jest.Mock;
const ADDRESS = "GACTVUNIT0000000000000000000000000000000000000000000000001";

function row(i: number, overrides: Record<string, unknown> = {}) {
  return {
    kind: "bet_placed",
    rank: 3,
    id: `bet-${i}`,
    marketId: "m1",
    ts: new Date(Date.UTC(2025, 0, 1, 0, 0, 0) - i * 1000),
    side: "FighterA",
    amount: "1000",
    payout: null,
    reason: null,
    ...overrides,
  };
}

function mockRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  // ok() calls res.status(code).json(body); fail() does the same.
  return { res, status, json };
}

describe("normalizeActivityLimit", () => {
  it("uses 20 when absent or invalid", () => {
    expect(normalizeActivityLimit(undefined)).toBe(20);
    expect(normalizeActivityLimit("abc")).toBe(20);
    expect(normalizeActivityLimit(0)).toBe(20);
  });

  it("caps the page size at 100", () => {
    expect(normalizeActivityLimit(500)).toBe(ACTIVITY_MAX_LIMIT);
    expect(normalizeActivityLimit("1000")).toBe(100);
  });

  it("floors fractional sizes", () => {
    expect(normalizeActivityLimit(7.9)).toBe(7);
  });
});

describe("activity cursor", () => {
  it("round-trips the keyset position", () => {
    const cursor = { ts: "2025-01-01T00:00:00.000Z", id: "bet-1", rank: 3 };
    expect(decodeActivityCursor(encodeActivityCursor(cursor))).toEqual(cursor);
  });

  it("treats a missing cursor as the first page", () => {
    expect(decodeActivityCursor(undefined)).toBeNull();
    expect(decodeActivityCursor("")).toBeNull();
  });

  it.each([
    ["not base64 json", "%%%"],
    ["missing id", Buffer.from(JSON.stringify({ ts: "2025-01-01T00:00:00Z", rank: 1 })).toString("base64url")],
    ["non-integer rank", Buffer.from(JSON.stringify({ ts: "2025-01-01T00:00:00Z", id: "x", rank: 1.5 })).toString("base64url")],
    ["invalid date", Buffer.from(JSON.stringify({ ts: "yesterday", id: "x", rank: 1 })).toString("base64url")],
  ])("rejects a cursor with %s", (_label, raw) => {
    expect(() => decodeActivityCursor(raw)).toThrow(InvalidActivityCursorError);
  });
});

describe("getUserActivity", () => {
  beforeEach(() => queryRaw.mockReset());

  it("returns an empty page for an empty or blank address without querying", async () => {
    expect(await getUserActivity("", {})).toEqual({ items: [], nextCursor: null });
    expect(await getUserActivity("   ", {})).toEqual({ items: [], nextCursor: null });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("fetches limit + 1 rows and issues a cursor when there are more", async () => {
    queryRaw.mockResolvedValue([row(0), row(1), row(2)]);
    const page = await getUserActivity(ADDRESS, { limit: 2 });
    expect(page.items.map((i) => i.id)).toEqual(["bet-0", "bet-1"]);
    expect(page.nextCursor).not.toBeNull();
    expect(decodeActivityCursor(page.nextCursor)).toEqual({
      ts: row(1).ts.toISOString(),
      id: "bet-1",
      rank: 3,
    });
  });

  it("issues no cursor on the last page", async () => {
    queryRaw.mockResolvedValue([row(0)]);
    const page = await getUserActivity(ADDRESS, { limit: 2 });
    expect(page.nextCursor).toBeNull();
    expect(page.items).toHaveLength(1);
  });

  it("maps each kind to its fields and stringifies amounts", async () => {
    queryRaw.mockResolvedValue([
      row(0, { kind: "winnings_claimed", rank: 2, payout: "1500", ts: new Date("2025-02-01T00:00:00Z") }),
      row(1, { kind: "dispute_raised", rank: 0, id: "d1", side: null, amount: null, reason: "bad call" }),
    ]);
    const page = await getUserActivity(ADDRESS, { limit: 10 });
    expect(page.items[0]).toEqual({
      kind: "winnings_claimed",
      id: "bet-0",
      marketId: "m1",
      timestamp: "2025-02-01T00:00:00.000Z",
      side: "FighterA",
      amount: "1000",
      payout: "1500",
    });
    expect(page.items[1]).toEqual({
      kind: "dispute_raised",
      id: "d1",
      marketId: "m1",
      timestamp: row(1).ts.toISOString(),
      reason: "bad call",
    });
  });

  it("throws before querying when the cursor is malformed", async () => {
    await expect(getUserActivity(ADDRESS, { cursor: "%%%" })).rejects.toBeInstanceOf(
      InvalidActivityCursorError
    );
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe("getUserActivityHandler", () => {
  beforeEach(() => queryRaw.mockReset());

  it("returns 200 with items and cursor meta", async () => {
    queryRaw.mockResolvedValue([row(0), row(1)]);
    const { res, status, json } = mockRes();
    await getUserActivityHandler({ params: { address: ADDRESS }, query: { limit: "1" } } as unknown as Request, res);
    expect(status).toHaveBeenCalledWith(200);
    const body = json.mock.calls[0][0];
    expect(body.data).toHaveLength(1);
    expect(body.meta.hasMore).toBe(true);
    expect(typeof body.meta.nextCursor).toBe("string");
  });

  it("returns 400 INVALID_CURSOR for a malformed cursor", async () => {
    const { res, status, json } = mockRes();
    await getUserActivityHandler({ params: { address: ADDRESS }, query: { cursor: "%%%" } } as unknown as Request, res);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: "INVALID_CURSOR" }) }));
  });

  it("returns 400 VALIDATION_ERROR for a non-numeric limit", async () => {
    const { res, status, json } = mockRes();
    await getUserActivityHandler({ params: { address: ADDRESS }, query: { limit: "abc" } } as unknown as Request, res);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: "VALIDATION_ERROR" }) }));
  });

  it("returns 200 with an empty page for an empty address", async () => {
    const { res, status, json } = mockRes();
    await getUserActivityHandler({ params: { address: "" }, query: {} } as unknown as Request, res);
    expect(status).toHaveBeenCalledWith(200);
    expect(json.mock.calls[0][0].data).toEqual([]);
    expect(json.mock.calls[0][0].meta).toEqual({ hasMore: false, nextCursor: null });
  });
});
