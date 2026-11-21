/**
 * Integration tests for the unified activity feed (#1588, B-152).
 * Runs against the real database: ordering and cursor continuity are enforced
 * in SQL, so mocks cannot check them.
 */
import { PrismaClient } from "@prisma/client";
import { getUserActivity, InvalidActivityCursorError } from "../src/services/user.service";

const prisma = new PrismaClient();

const USER = "GACTVTEST0000000000000000000000000000000000000000000000001";
const OTHER = "GACTVTEST0000000000000000000000000000000000000000000000002";
const hour = (h: number) => new Date(Date.UTC(2025, 0, 1, h));

async function cleanup() {
  await prisma.dispute.deleteMany({ where: { id: { startsWith: "actv" } } });
  await prisma.bet.deleteMany({ where: { id: { startsWith: "actv" } } });
  await prisma.market.deleteMany({ where: { id: { startsWith: "actv-market" } } });
}

beforeAll(async () => {
  await cleanup();

  const base = {
    contractAddress: "C",
    fighterA: { name: "A" },
    fighterB: { name: "B" },
    scheduledAt: hour(0),
    bettingEndsAt: hour(0),
    createdAt: hour(0),
    createdBy: USER,
    oracleAddress: OTHER,
  };
  await prisma.market.createMany({
    data: [
      { ...base, id: "actv-market-1", contractAddress: "CACTV1", status: "Resolved", outcome: "FighterA" },
      { ...base, id: "actv-market-2", contractAddress: "CACTV2", status: "Cancelled", outcome: null },
      { ...base, id: "actv-market-3", contractAddress: "CACTV3", status: "Resolved", outcome: "Draw" },
    ],
  });

  const bet = (
    id: string,
    marketId: string,
    side: "FighterA" | "FighterB",
    placedAt: Date,
    claimedAt: Date | null = null,
    bettor = USER
  ) => ({
    id,
    marketId,
    bettor,
    side,
    amount: 1000n,
    placedAt,
    claimed: claimedAt !== null,
    claimedAt,
    payout: claimedAt ? 1500n : null,
  });

  await prisma.bet.createMany({
    data: [
      bet("actvb1", "actv-market-1", "FighterA", hour(0), hour(3)), // winnings claim at h3
      bet("actvb2", "actv-market-1", "FighterB", hour(1)), // unclaimed loser
      bet("actvb3", "actv-market-2", "FighterA", hour(2), hour(4)), // refund (cancelled) at h4
      bet("actvb4", "actv-market-3", "FighterB", hour(5), hour(6)), // refund (draw) at h6
      bet("actvb5", "actv-market-1", "FighterA", hour(7)), // placed only
      bet("actvb7", "actv-market-1", "FighterB", hour(9), hour(10)), // losing claim: excluded
      bet("actvb8", "actv-market-1", "FighterA", hour(11), hour(12), OTHER), // other user
    ],
  });

  await prisma.dispute.create({
    data: { id: "actvd1", marketId: "actv-market-1", raisedBy: USER, reason: "r1", raisedAt: hour(8) },
  });
  await prisma.dispute.create({
    data: { id: "actvd9", marketId: "actv-market-1", raisedBy: OTHER, reason: "r9", raisedAt: hour(8) },
  });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const shape = (items: Array<{ kind: string; id: string }>) => items.map((i) => `${i.kind}:${i.id}`);

describe("getUserActivity (database)", () => {
  it("merges all four kinds newest first and excludes other users and losing claims", async () => {
    const { items, nextCursor } = await getUserActivity(USER, { limit: 50 });
    expect(nextCursor).toBeNull();
    expect(shape(items)).toEqual([
      "bet_placed:actvb7",
      "dispute_raised:actvd1",
      "bet_placed:actvb5",
      "refund_claimed:actvb4",
      "bet_placed:actvb4",
      "refund_claimed:actvb3",
      "winnings_claimed:actvb1",
      "bet_placed:actvb3",
      "bet_placed:actvb2",
      "bet_placed:actvb1",
    ]);
  });

  it("returns a typed kind with the fields that apply to it", async () => {
    const { items } = await getUserActivity(USER, { limit: 50 });
    const byKey = Object.fromEntries(items.map((i) => [`${i.kind}:${i.id}`, i]));
    expect(byKey["winnings_claimed:actvb1"]).toEqual({
      kind: "winnings_claimed",
      id: "actvb1",
      marketId: "actv-market-1",
      timestamp: hour(3).toISOString(),
      side: "FighterA",
      amount: "1000",
      payout: "1500",
    });
    expect(byKey["dispute_raised:actvd1"]).toEqual({
      kind: "dispute_raised",
      id: "actvd1",
      marketId: "actv-market-1",
      timestamp: hour(8).toISOString(),
      reason: "r1",
    });
  });

  it("breaks timestamp ties by id then kind, and paging matches the full list", async () => {
    // actvd2 and actvb5 share a timestamp; "actvd2" > "actvb5" so the dispute comes first.
    await prisma.dispute.create({
      data: { id: "actvd2", marketId: "actv-market-1", raisedBy: USER, reason: "tie", raisedAt: hour(7) },
    });
    try {
      const full = (await getUserActivity(USER, { limit: 100 })).items;
      const at7 = full.filter((i) => i.timestamp === hour(7).toISOString()).map((i) => i.id);
      expect(at7).toEqual(["actvd2", "actvb5"]);

      const collected: typeof full = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const page = await getUserActivity(USER, { cursor, limit: 3 });
        collected.push(...page.items);
        cursor = page.nextCursor;
        pages++;
        expect(pages).toBeLessThan(20); // guard against a cursor that never ends
      } while (cursor);

      expect(shape(collected)).toEqual(shape(full));
      expect(new Set(shape(collected)).size).toBe(collected.length); // no duplicates across pages
    } finally {
      await prisma.dispute.delete({ where: { id: "actvd2" } });
    }
  });

  it("returns an empty page for an address with no activity or an empty address", async () => {
    expect(await getUserActivity("GNOACTIVITY", {})).toEqual({ items: [], nextCursor: null });
    expect(await getUserActivity("", {})).toEqual({ items: [], nextCursor: null });
  });

  it("rejects a malformed cursor", async () => {
    await expect(getUserActivity(USER, { cursor: "not-a-cursor" })).rejects.toBeInstanceOf(
      InvalidActivityCursorError
    );
  });
});
