import { Bet, BetSide, Prisma } from "@prisma/client";
import { db } from "../db";
import { redis } from "../lib/redis";
import { guardRedis } from "../lib/redis-guard";

export interface BetFilters {
  status?: "pending" | "won" | "lost" | "claimed";
  marketId?: string;
}

export interface CreateBetDTO {
  id: string;
  marketId: string;
  bettor: string;
  side: BetSide;
  amount: bigint;
  placedAt: Date;
  txHash?: string;
}

export interface PortfolioSummary {
  totalStaked: bigint;
  totalWinnings: bigint;
  pendingClaims: bigint;
  activeBets: number;
  completedBets: number;
  roi: number;
}

export type LeaderboardPeriod = "7d" | "30d" | "all";
export type LeaderboardSort = "profit" | "roi" | "winRate";

export interface LeaderboardEntry {
  rank: number;
  bettor: string;
  realisedProfit: bigint;
  totalStaked: bigint;
  totalPayout: bigint;
  settledBets: number;
  wonBets: number;
  winRate: number;
  /** realisedProfit / totalStaked as a percentage (0 when nothing staked). */
  roi: number;
}

export interface LeaderboardQuery {
  /** Time window on Bet.placedAt. Defaults to "all". */
  period?: LeaderboardPeriod;
  /** Page size, clamped to [1, LEADERBOARD_MAX_LIMIT]. Defaults to 50. */
  limit?: number;
  /** Bettors with fewer settled bets than this are excluded. Defaults to 3. */
  minBets?: number;
  /** Primary ranking key. Ties fall through profit, then bettor address. */
  sort?: LeaderboardSort;
  /** Zero-based position in the ranking; derived from the decoded cursor. */
  offset?: number;
}

export interface LeaderboardResult {
  period: LeaderboardPeriod;
  sort: LeaderboardSort;
  minBets: number;
  limit: number;
  generatedAt: Date;
  entries: LeaderboardEntry[];
  nextCursor: string | null;
}


export const MAX_BET_PAGE_LIMIT = 100;
export const DEFAULT_BET_PAGE_LIMIT = 20;

export interface BetCursor {
  placedAt: Date;
  id: string;
}

export interface PaginatedBets {
  bets: Bet[];
  nextCursor: string | null;
}

/**
 * Encodes a (placedAt, id) cursor into an opaque base64 string.
 */
export function encodeBetCursor(cursor: BetCursor): string {
  return Buffer.from(
    JSON.stringify({ placedAt: cursor.placedAt.toISOString(), id: cursor.id })
  ).toString("base64url");
}

/**
 * Decodes an opaque cursor string back into a (placedAt, id) pair.
 * Returns null when the cursor is missing or malformed.
 */
export function decodeBetCursor(cursor?: string | null): BetCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof parsed?.placedAt !== "string" || typeof parsed?.id !== "string") {
      return null;
    }
    const placedAt = new Date(parsed.placedAt);
    if (Number.isNaN(placedAt.getTime())) return null;
    return { placedAt, id: parsed.id };
  } catch {
    return null;
  }
}

/**
 * Normalizes a requested page size, clamping it to [1, MAX_BET_PAGE_LIMIT].
 */
export function normalizeBetLimit(limit?: number | string | null): number {
  const parsed = typeof limit === "string" ? Number.parseInt(limit, 10) : limit;
  if (parsed === undefined || parsed === null || Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_BET_PAGE_LIMIT;
  }
  return Math.min(Math.floor(parsed), MAX_BET_PAGE_LIMIT);
}

/**
 * Builds the Prisma where clause for keyset pagination on (placedAt, id).
 * Ordering is descending, so the next page contains rows strictly "older"
 * than the cursor row.
 */
function cursorWhere(cursor: BetCursor | null): Record<string, unknown> {
  if (!cursor) return {};
  return {
    OR: [
      { placedAt: { lt: cursor.placedAt } },
      { placedAt: cursor.placedAt, id: { lt: cursor.id } },
    ],
  };
}

/**
 * Fetches a single page of bets ordered stably by (placedAt, id) descending.
 * Fetches limit + 1 rows to determine whether a next page exists.
 */
async function fetchBetPage(
  where: Record<string, unknown>,
  limit: number,
  cursor: BetCursor | null
): Promise<PaginatedBets> {
  const rows = await db.bet.findMany({
    where: { ...where, ...cursorWhere(cursor) },
    orderBy: [{ placedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const bets = hasMore ? rows.slice(0, limit) : rows;
  const last = bets[bets.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeBetCursor({ placedAt: last.placedAt, id: last.id })
      : null;

  return { bets, nextCursor };
}

export async function getBetsByAddress(
  address: string,
  filters?: BetFilters
): Promise<Bet[]> {
  const where: Record<string, unknown> = { bettor: address };

  if (filters?.marketId) {
    where.marketId = filters.marketId;
  }

  if (filters?.status === "claimed") {
    // Return bets that have been claimed (winnings collected)
    where.claimed = true;
    return db.bet.findMany({
      where,
      orderBy: [{ placedAt: "desc" }, { id: "desc" }],
    });
  }

  if (filters?.status === "pending") {
    // Pending: market has not yet resolved (no outcome set)
    const bets = await db.bet.findMany({
      where,
      include: { market: true },
      orderBy: [{ placedAt: "desc" }, { id: "desc" }],
    });
    return bets.filter((bet) => bet.market.outcome === null);
  }

  if (filters?.status === "won" || filters?.status === "lost") {
    // Won/lost: market resolved and outcome matches (or doesn't match) bet side.
    // Includes both claimed and unclaimed bets — claimed won bets still count as "won".
    const bets = await db.bet.findMany({
      where,
      include: { market: true },
      orderBy: [{ placedAt: "desc" }, { id: "desc" }],
    });
    return bets.filter((bet) => {
      if (!bet.market.outcome) return false;
      const won = bet.market.outcome === bet.side;
      return filters.status === "won" ? won : !won;
    });
  }

  // No status filter — return all bets for the address
  return db.bet.findMany({
    where,
    orderBy: [{ placedAt: "desc" }, { id: "desc" }],
  });
}

/**
 * Cursor-paginated bets for a Stellar address, ordered by (placedAt, id).
 */
export async function getBetsByAddressPaginated(
  address: string,
  options?: { cursor?: string | null; limit?: number | string | null }
): Promise<PaginatedBets> {
  const limit = normalizeBetLimit(options?.limit);
  const cursor = decodeBetCursor(options?.cursor);
  return fetchBetPage({ bettor: address }, limit, cursor);
}

export async function getBetsByMarket(market_id: string): Promise<Bet[]> {
  return db.bet.findMany({
    where: { marketId: market_id },
    orderBy: [{ placedAt: "desc" }, { id: "desc" }],
  });
}

/**
 * Cursor-paginated bets for a market, ordered by (placedAt, id).
 */
export async function getBetsByMarketPaginated(
  market_id: string,
  options?: { cursor?: string | null; limit?: number | string | null }
): Promise<PaginatedBets> {
  const limit = normalizeBetLimit(options?.limit);
  const cursor = decodeBetCursor(options?.cursor);
  return fetchBetPage({ marketId: market_id }, limit, cursor);
}

export async function recordBet(betData: CreateBetDTO): Promise<Bet> {
  const market = await db.market.findUnique({ where: { id: betData.marketId } });
  if (!market) throw new Error(`Market not found: ${betData.marketId}`);

  return db.bet.upsert({
    where: { id: betData.id },
    update: {},
    create: {
      id: betData.id,
      marketId: betData.marketId,
      bettor: betData.bettor,
      side: betData.side,
      amount: betData.amount,
      placedAt: betData.placedAt,
      txHash: betData.txHash,
    },
  });
}

export async function markBetClaimed(bet_id: string, payout: bigint): Promise<Bet> {
  return db.bet.update({
    where: { id: bet_id },
    data: { claimed: true, claimedAt: new Date(), payout },
  });
}

/**
 * Marks a bet as claimed by matching on (marketId, bettor).
 * Used for winnings_claimed / refund_claimed events which identify
 * the bet by market and bettor. Uses updateMany for atomicity.
 */
export async function markBetClaimedByMarketAndBettor(
  marketId: string,
  bettor: string,
  payout: bigint
): Promise<void> {
  await db.bet.updateMany({
    where: { marketId, bettor, claimed: false },
    data: { claimed: true, claimedAt: new Date(), payout },
  });
}

export async function calculatePotentialPayout(
  market_id: string,
  side: BetSide,
  amount: bigint
): Promise<bigint> {
  const market = await db.market.findUnique({ where: { id: market_id } });
  if (!market) throw new Error(`Market not found: ${market_id}`);

  const poolSide = side === "FighterA" ? market.poolA : market.poolB;
  if (poolSide === 0n) return 0n;

  const totalPool = market.totalPool;
  const FEE_BP = 200n; // 2% = 200 basis points
  const fee = (totalPool * FEE_BP) / 10000n;
  const netPool = totalPool - fee;

  const payout = (amount * netPool) / (poolSide + amount);
  return payout;
}

/**
 * Returns a portfolio summary for a Stellar address.
 * - totalStaked: sum of all bet amounts
 * - totalWinnings: sum of payouts from claimed winning bets
 * - pendingClaims: sum of amounts on winning bets not yet claimed
 * - activeBets: bets on markets still Open or Locked (not resolved)
 * - completedBets: bets on Resolved or Cancelled markets
 * - roi: (totalWinnings - totalStaked) / totalStaked * 100, or 0 if no staked amount
 *
 * Always returns a value — never throws 404 for unknown addresses.
 */
export async function getPortfolioSummary(address: string): Promise<PortfolioSummary> {
  const bets = await db.bet.findMany({
    where: { bettor: address },
    include: { market: true },
  });

  if (bets.length === 0) {
    return {
      totalStaked: 0n,
      totalWinnings: 0n,
      pendingClaims: 0n,
      activeBets: 0,
      completedBets: 0,
      roi: 0,
    };
  }

  let totalStaked = 0n;
  let totalWinnings = 0n;
  let pendingClaims = 0n;
  let activeBets = 0;
  let completedBets = 0;

  for (const bet of bets) {
    totalStaked += bet.amount;

    const isResolved =
      bet.market.status === "Resolved" || bet.market.status === "Cancelled";

    if (isResolved) {
      completedBets += 1;

      // Check if this bet won
      const won =
        bet.market.outcome !== null && bet.market.outcome === bet.side;

      if (won) {
        if (bet.claimed && bet.payout !== null) {
          // Already claimed — count actual payout
          totalWinnings += bet.payout;
        } else if (!bet.claimed) {
          // Won but not yet claimed — count as pending
          pendingClaims += bet.amount;
        }
      }
    } else {
      // Market still active (Open, Locked, Disputed)
      activeBets += 1;
    }
  }

  const roi =
    totalStaked > 0n
      ? (Number(totalWinnings - totalStaked) / Number(totalStaked)) * 100
      : 0;

  return {
    totalStaked,
    totalWinnings,
    pendingClaims,
    activeBets,
    completedBets,
    roi,
  };
}

const LEADERBOARD_PERIOD_MS: Record<Exclude<LeaderboardPeriod, "all">, number> = {
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const LEADERBOARD_CACHE_TTL_SECONDS = 30;
const LEADERBOARD_CACHE_PREFIX = "leaderboard:v2:";
const LEADERBOARD_DEFAULT_LIMIT = 50;
const LEADERBOARD_MAX_LIMIT = 100;
export const LEADERBOARD_DEFAULT_MIN_BETS = 3;
export const LEADERBOARD_MAX_MIN_BETS = 1000;

/**
 * Normalises the period query param, defaulting to "all" for unknown values.
 */
export function parseLeaderboardPeriod(period?: string): LeaderboardPeriod {
  if (period === "7d" || period === "30d" || period === "all") {
    return period;
  }
  return "all";
}

/**
 * Normalises the limit query param, clamping to [1, LEADERBOARD_MAX_LIMIT].
 */
export function parseLeaderboardLimit(limit?: string | number): number {
  const parsed = typeof limit === "number" ? limit : Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return LEADERBOARD_DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(parsed), LEADERBOARD_MAX_LIMIT);
}

/** Cursors are opaque base64url-encoded page offsets. */
export function encodeLeaderboardCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), "utf8").toString("base64url");
}

/**
 * Returns the offset encoded in a cursor, 0 when no cursor is given, or
 * `null` when the cursor is malformed.
 */
export function decodeLeaderboardCursor(cursor?: string | null): number | null {
  if (!cursor) return 0;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "o" in parsed &&
      typeof parsed.o === "number" &&
      Number.isSafeInteger(parsed.o) &&
      parsed.o >= 0
    ) {
      return parsed.o;
    }
  } catch {
    // fall through to null
  }
  return null;
}

interface LeaderboardAggregateRow {
  bettor: string;
  staked: string;
  payout: string;
  settled: number;
  won: number;
}

/**
 * Aggregates claimed bets per bettor in SQL. The period filter uses
 * Bet.placedAt, which is covered by the (claimed, placedAt) index. Bettors
 * below `minBets` settled bets are dropped in HAVING.
 *
 * `Bet.side` (BetSide) and `Market.outcome` (Outcome) are distinct Postgres
 * enum types, so they are compared as text.
 */
async function loadLeaderboardAggregates(
  period: LeaderboardPeriod,
  minBets: number
): Promise<LeaderboardAggregateRow[]> {
  const windowFilter =
    period === "all"
      ? Prisma.empty
      : Prisma.sql`AND b."placedAt" >= ${new Date(Date.now() - LEADERBOARD_PERIOD_MS[period])}`;

  return db.$queryRaw<LeaderboardAggregateRow[]>(Prisma.sql`
    SELECT b."bettor" AS "bettor",
           COALESCE(SUM(b."amount"), 0)::text AS "staked",
           COALESCE(SUM(b."payout"), 0)::text AS "payout",
           COUNT(*)::int AS "settled",
           COALESCE(SUM(CASE WHEN m."outcome"::text = b."side"::text THEN 1 ELSE 0 END), 0)::int AS "won"
    FROM "Bet" b
    JOIN "Market" m ON m."id" = b."marketId"
    WHERE b."claimed" = true ${windowFilter}
    GROUP BY b."bettor"
    HAVING COUNT(*) >= ${minBets}
  `);
}

const cmpBigintDesc = (x: bigint, y: bigint): number => (x === y ? 0 : x > y ? -1 : 1);
const cmpNumberDesc = (x: number, y: number): number => (x === y ? 0 : x > y ? -1 : 1);
const cmpString = (x: string, y: string): number => (x === y ? 0 : x < y ? -1 : 1);

/**
 * Sorts entries by the requested key, then by the remaining metrics, then by
 * bettor address, so every ordering is total and repeatable across requests.
 */
function compareLeaderboardEntries(sort: LeaderboardSort) {
  return (a: Omit<LeaderboardEntry, "rank">, b: Omit<LeaderboardEntry, "rank">): number => {
    const byProfit = () => cmpBigintDesc(a.realisedProfit, b.realisedProfit);
    const byRoi = () => cmpNumberDesc(a.roi, b.roi);
    const byWinRate = () => cmpNumberDesc(a.winRate, b.winRate);
    const comparators =
      sort === "roi"
        ? [byRoi, byProfit, byWinRate]
        : sort === "winRate"
          ? [byWinRate, byProfit, byRoi]
          : [byProfit, byWinRate, byRoi];
    for (const compare of comparators) {
      const result = compare();
      if (result !== 0) return result;
    }
    return cmpString(a.bettor, b.bettor);
  };
}

function rankLeaderboard(
  rows: LeaderboardAggregateRow[],
  sort: LeaderboardSort
): Omit<LeaderboardEntry, "rank">[] {
  return rows
    .map((row) => {
      const totalStaked = BigInt(row.staked);
      const totalPayout = BigInt(row.payout);
      const realisedProfit = totalPayout - totalStaked;
      return {
        bettor: row.bettor,
        realisedProfit,
        totalStaked,
        totalPayout,
        settledBets: row.settled,
        wonBets: row.won,
        winRate: row.settled > 0 ? (row.won / row.settled) * 100 : 0,
        roi: totalStaked > 0n ? (Number(realisedProfit) / Number(totalStaked)) * 100 : 0,
      };
    })
    .sort(compareLeaderboardEntries(sort));
}

/** Cached form: bigints are stored as decimal strings. */
interface SerializedLeaderboardEntry extends Omit<LeaderboardEntry, "rank" | "realisedProfit" | "totalStaked" | "totalPayout"> {
  rank: number;
  realisedProfit: string;
  totalStaked: string;
  totalPayout: string;
}

interface SerializedLeaderboardResult extends Omit<LeaderboardResult, "generatedAt" | "entries"> {
  generatedAt: string;
  entries: SerializedLeaderboardEntry[];
}

function serializeLeaderboard(result: LeaderboardResult): string {
  const payload: SerializedLeaderboardResult = {
    ...result,
    generatedAt: result.generatedAt.toISOString(),
    entries: result.entries.map((e) => ({
      ...e,
      realisedProfit: e.realisedProfit.toString(),
      totalStaked: e.totalStaked.toString(),
      totalPayout: e.totalPayout.toString(),
    })),
  };
  return JSON.stringify(payload);
}

function deserializeLeaderboard(raw: string): LeaderboardResult | null {
  try {
    const payload = JSON.parse(raw) as SerializedLeaderboardResult;
    return {
      ...payload,
      generatedAt: new Date(payload.generatedAt),
      entries: payload.entries.map((e) => ({
        ...e,
        realisedProfit: BigInt(e.realisedProfit),
        totalStaked: BigInt(e.totalStaked),
        totalPayout: BigInt(e.totalPayout),
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Computes the leaderboard from claimed bets.
 *
 * - realisedProfit = sum(payout) - sum(amount) over claimed bets
 * - winRate = wonBets / settledBets * 100
 * - roi = realisedProfit / totalStaked * 100
 *
 * Only bettors with at least `minBets` settled bets in the window are ranked.
 * Pages are read from a Redis cache keyed by every query parameter for
 * LEADERBOARD_CACHE_TTL_SECONDS. A Redis outage or timeout falls back to the
 * database, so the endpoint stays available.
 */
export async function getLeaderboard(query: LeaderboardQuery = {}): Promise<LeaderboardResult> {
  const period = query.period ?? "all";
  const sort = query.sort ?? "profit";
  const minBets = Math.min(
    Math.max(Math.floor(query.minBets ?? LEADERBOARD_DEFAULT_MIN_BETS), 1),
    LEADERBOARD_MAX_MIN_BETS
  );
  const limit = parseLeaderboardLimit(query.limit);
  const offset = query.offset ?? 0;
  const cacheKey = `${LEADERBOARD_CACHE_PREFIX}${period}:${sort}:${minBets}:${limit}:${offset}`;

  const cached = await guardRedis(
    "leaderboard.cache.get",
    () => redis.get(cacheKey),
    null
  );
  if (cached !== null) {
    const hit = deserializeLeaderboard(cached);
    if (hit) return hit;
  }

  const rows = await loadLeaderboardAggregates(period, minBets);
  const ranked = rankLeaderboard(rows, sort);
  const entries: LeaderboardEntry[] = ranked
    .slice(offset, offset + limit)
    .map((entry, index) => ({ ...entry, rank: offset + index + 1 }));

  const nextOffset = offset + limit;
  const result: LeaderboardResult = {
    period,
    sort,
    minBets,
    limit,
    generatedAt: new Date(),
    entries,
    nextCursor: nextOffset < ranked.length ? encodeLeaderboardCursor(nextOffset) : null,
  };

  await guardRedis(
    "leaderboard.cache.set",
    async () => {
      await redis.set(cacheKey, serializeLeaderboard(result), "EX", LEADERBOARD_CACHE_TTL_SECONDS);
    },
    undefined
  );

  return result;
}

/**
 * Removes every cached leaderboard page. Useful for tests and after settlement events.
 */
export async function clearLeaderboardCache(): Promise<void> {
  await guardRedis(
    "leaderboard.cache.clear",
    async () => {
      const keys = await redis.keys(`${LEADERBOARD_CACHE_PREFIX}*`);
      if (keys.length > 0) await redis.del(...keys);
    },
    undefined
  );
}
