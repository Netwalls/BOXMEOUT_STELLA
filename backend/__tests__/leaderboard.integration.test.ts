/**
 * Integration tests for #1589: leaderboard time windows, minimum-bets filter,
 * sort keys, deterministic tie-breaks and cursor pagination.
 *
 * Runs against the migrated test database. Every fixture uses the "lbit-"
 * prefix and is removed afterwards, and assertions only look at those
 * bettors because the leaderboard is global.
 */

import { db } from "../src/db";
import { redis } from "../src/lib/redis";
import {
  clearLeaderboardCache,
  decodeLeaderboardCursor,
  encodeLeaderboardCursor,
  getLeaderboard,
  LeaderboardEntry,
} from "../src/services/bet.service";

const PREFIX = "lbit-";
const DAY_MS = 24 * 60 * 60 * 1000;

const bettors = {
  // Three wins, staked 300, paid 600: profit +300, winRate 100.
  a: `${PREFIX}a`,
  // Identical record to `a`: must tie and sort after `a` by address.
  d: `${PREFIX}d`,
  // Three losses: profit -300.
  b: `${PREFIX}b`,
  // Only two settled bets: excluded by default minBets (3).
  c: `${PREFIX}c`,
  // Huge win placed 40 days ago: outside 7d and 30d windows.
  old: `${PREFIX}old`,
};

const now = Date.now();

async function seedMarket(id: string, outcome: "FighterA" | "FighterB", ageMs: number) {
  await db.market.create({
    data: {
      id,
      contractAddress: `${id}-contract`,
      fighterA: { name: "A" },
      fighterB: { name: "B" },
      scheduledAt: new Date(now - ageMs),
      bettingEndsAt: new Date(now - ageMs),
      createdAt: new Date(now - ageMs),
      createdBy: "lbit-creator",
      oracleAddress: "lbit-oracle",
      status: "Resolved",
      outcome,
      resolvedAt: new Date(now - ageMs),
    },
  });
}

async function seedBets(
  prefix: string,
  bettor: string,
  count: number,
  spec: { market: string; side: "FighterA" | "FighterB"; amount: bigint; payout: bigint; ageMs: number }
) {
  for (let i = 0; i < count; i++) {
    await db.bet.create({
      data: {
        id: `${prefix}-${bettor}-${i}`,
        marketId: spec.market,
        bettor,
        side: spec.side,
        amount: spec.amount,
        placedAt: new Date(now - spec.ageMs),
        claimed: true,
        claimedAt: new Date(now - spec.ageMs),
        payout: spec.payout,
      },
    });
  }
}

/** Keeps only fixture bettors, preserving the leaderboard's order. */
function ours(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return entries.filter((e) => e.bettor.startsWith(PREFIX));
}

describe("#1589 leaderboard windows, thresholds, sorting and pagination", () => {
  beforeAll(async () => {
    await clearLeaderboardCache();
    await seedMarket("lbit-m-recent", "FighterA", 1 * DAY_MS);
    await seedMarket("lbit-m-old", "FighterB", 40 * DAY_MS);

    const recent = { market: "lbit-m-recent", amount: 100n, ageMs: 1 * DAY_MS };
    await seedBets("r", bettors.a, 3, { ...recent, side: "FighterA", payout: 200n });
    await seedBets("r", bettors.d, 3, { ...recent, side: "FighterA", payout: 200n });
    await seedBets("r", bettors.b, 3, { ...recent, side: "FighterB", payout: 0n });
    await seedBets("r", bettors.c, 2, { ...recent, side: "FighterA", payout: 200n });
    await seedBets("o", bettors.old, 3, {
      market: "lbit-m-old",
      side: "FighterB",
      amount: 100n,
      payout: 1000n,
      ageMs: 40 * DAY_MS,
    });
  });

  afterAll(async () => {
    await db.bet.deleteMany({ where: { bettor: { startsWith: PREFIX } } });
    await db.market.deleteMany({ where: { id: { startsWith: "lbit-m-" } } });
    await clearLeaderboardCache();
    await db.$disconnect();
    redis.disconnect();
  });

  it("applies the default minBets of 3 and excludes bettors below it", async () => {
    const result = await getLeaderboard({ period: "all" });
    expect(result.minBets).toBe(3);
    const names = ours(result.entries).map((e) => e.bettor);
    expect(names).not.toContain(bettors.c);
    expect(names).toEqual(expect.arrayContaining([bettors.a, bettors.d, bettors.b, bettors.old]));
  });

  it("lets minBets lower the threshold so two-bet bettors appear", async () => {
    const result = await getLeaderboard({ period: "all", minBets: 2 });
    expect(ours(result.entries).map((e) => e.bettor)).toContain(bettors.c);
  });

  it("the 7d window excludes bets placed 40 days ago", async () => {
    const result = await getLeaderboard({ period: "7d" });
    const names = ours(result.entries).map((e) => e.bettor);
    expect(names).toContain(bettors.a);
    expect(names).not.toContain(bettors.old);
  });

  it("the 30d window also excludes bets placed 40 days ago", async () => {
    const result = await getLeaderboard({ period: "30d" });
    expect(ours(result.entries).map((e) => e.bettor)).not.toContain(bettors.old);
  });

  it("the all window includes the older bets", async () => {
    const result = await getLeaderboard({ period: "all" });
    expect(ours(result.entries).map((e) => e.bettor)).toContain(bettors.old);
  });

  it("ranks by profit by default and breaks ties by bettor address", async () => {
    const result = await getLeaderboard({ period: "all", sort: "profit" });
    const order = ours(result.entries).map((e) => e.bettor);
    // old (+2700) > a (+300) == d (+300, tie broken by address) > b (-300)
    expect(order).toEqual([bettors.old, bettors.a, bettors.d, bettors.b]);
    const a = ours(result.entries).find((e) => e.bettor === bettors.a)!;
    expect(a.realisedProfit).toBe(300n);
    expect(a.totalStaked).toBe(300n);
    expect(a.totalPayout).toBe(600n);
    expect(a.settledBets).toBe(3);
    expect(a.wonBets).toBe(3);
    expect(a.winRate).toBe(100);
    expect(a.roi).toBe(100);
  });

  it("sorts by roi, where the 40-day win stays first and losses last", async () => {
    const result = await getLeaderboard({ period: "all", sort: "roi" });
    const order = ours(result.entries).map((e) => e.bettor);
    // old roi = 900%, a/d = 100%, b = -100%
    expect(order).toEqual([bettors.old, bettors.a, bettors.d, bettors.b]);
  });

  it("sorts by winRate, using profit as the next tie-break", async () => {
    const result = await getLeaderboard({ period: "all", sort: "winRate" });
    const order = ours(result.entries).map((e) => e.bettor);
    // old and a/d all have winRate 100; old has higher profit so it leads.
    expect(order.slice(0, 3)).toEqual([bettors.old, bettors.a, bettors.d]);
    expect(order[order.length - 1]).toBe(bettors.b);
  });

  it("paginates with cursors and assigns ranks that continue across pages", async () => {
    const full = ours((await getLeaderboard({ period: "all", limit: 100 })).entries);

    const collected: LeaderboardEntry[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 500; guard++) {
      const offset: number = cursor ? decodeLeaderboardCursor(cursor) ?? 0 : 0;
      const page = await getLeaderboard({ period: "all", limit: 1, offset });
      collected.push(...ours(page.entries));
      cursor = page.nextCursor;
      if (!cursor) break;
    }

    expect(collected.map((e) => e.bettor)).toEqual(full.map((e) => e.bettor));
    const ranks = collected.map((e) => e.rank);
    expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
  });

  it("round-trips cursors and rejects malformed ones", () => {
    expect(decodeLeaderboardCursor(encodeLeaderboardCursor(42))).toBe(42);
    expect(decodeLeaderboardCursor(undefined)).toBe(0);
    expect(decodeLeaderboardCursor("not-a-cursor")).toBeNull();
    expect(decodeLeaderboardCursor(Buffer.from('{"o":-1}').toString("base64url"))).toBeNull();
  });
});
