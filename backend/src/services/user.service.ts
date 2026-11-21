import { Prisma } from "@prisma/client";
import { db as prisma } from "../db";
import { getBetsByAddressPaginated, type PaginatedBets } from "./bet.service";

export interface UserProfile {
  address: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateUserDTO {
  displayName?: string | null;
  avatarUrl?: string | null;
}

/**
 * Fetches a user profile by wallet address.
 *
 * Profile fields live on the User row (B-121, #1557). An address with a User
 * row always has a profile, even with no bets. An address without a row falls
 * back to a bet-derived profile (no display fields); an address with neither
 * returns null.
 */
export async function getUserByAddress(
  address: string
): Promise<UserProfile | null> {
  const user = await prisma.user.findUnique({ where: { address } });

  if (user) {
    return {
      address: user.address,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  const firstBet = await prisma.bet.findFirst({
    where: { bettor: address },
    orderBy: { placedAt: "asc" },
  });

  if (!firstBet) return null;

  return {
    address,
    createdAt: firstBet.placedAt,
    updatedAt: new Date(),
  };
}

/**
 * Creates or updates a user's profile fields. Upserts the User row; profile
 * data is no longer written to AdminLog.
 */
export async function updateUser(
  address: string,
  data: UpdateUserDTO
): Promise<UserProfile> {
  const patch: UpdateUserDTO = {};
  if (data.displayName !== undefined) patch.displayName = data.displayName;
  if (data.avatarUrl !== undefined) patch.avatarUrl = data.avatarUrl;

  await prisma.adminLog.create({
    data: {
      action: "UPDATE_USER",
      actor: address,
      target: address,
      metadata: data as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    address: user.address,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Cursor-paginated bets placed by a wallet, ordered by (placedAt, id) descending.
 */
export async function getUserBets(
  address: string,
  options?: { cursor?: string | null; limit?: number | string | null }
): Promise<PaginatedBets> {
  return getBetsByAddressPaginated(address, options);
}

// ─── Unified activity feed (#1588, B-152) ────────────────────────────────────

export const ACTIVITY_DEFAULT_LIMIT = 20;
export const ACTIVITY_MAX_LIMIT = 100;

export type ActivityKind = "bet_placed" | "winnings_claimed" | "refund_claimed" | "dispute_raised";

/**
 * Tie-break rank for items with the same timestamp and source id. Higher ranks
 * sort first, so the feed order is total: (timestamp desc, id desc, rank desc).
 */
const KIND_RANK: Record<ActivityKind, number> = {
  dispute_raised: 0,
  refund_claimed: 1,
  winnings_claimed: 2,
  bet_placed: 3,
};

export interface ActivityItem {
  kind: ActivityKind;
  /** Source row id: the bet id for bet kinds, the dispute id for disputes. */
  id: string;
  marketId: string;
  /** ISO 8601. placedAt for bet_placed, claimedAt for claims, raisedAt for disputes. */
  timestamp: string;
  side?: "FighterA" | "FighterB";
  /** Stake in base units, as a decimal string. Bet kinds only. */
  amount?: string;
  /** Amount paid out, as a decimal string. Claim kinds only. */
  payout?: string;
  /** Dispute reason. dispute_raised only. */
  reason?: string;
}

export interface ActivityPage {
  items: ActivityItem[];
  nextCursor: string | null;
}

/** Keyset position of the last item on a page. Opaque to clients. */
interface ActivityCursor {
  ts: string;
  id: string;
  rank: number;
}

export class InvalidActivityCursorError extends Error {
  constructor() {
    super("cursor is malformed");
    this.name = "InvalidActivityCursorError";
  }
}

export function encodeActivityCursor(cursor: ActivityCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

/** Returns null when no cursor is given. Throws InvalidActivityCursorError when malformed. */
export function decodeActivityCursor(raw?: string | null): ActivityCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    const ts = new Date(parsed?.ts);
    if (
      typeof parsed?.id !== "string" ||
      typeof parsed?.rank !== "number" ||
      !Number.isInteger(parsed.rank) ||
      Number.isNaN(ts.getTime())
    ) {
      throw new InvalidActivityCursorError();
    }
    return { ts: ts.toISOString(), id: parsed.id, rank: parsed.rank };
  } catch {
    throw new InvalidActivityCursorError();
  }
}

/** Clamps a requested page size to [1, ACTIVITY_MAX_LIMIT]; falls back to the default. */
export function normalizeActivityLimit(limit?: number | string | null): number {
  const parsed = typeof limit === "string" ? Number.parseInt(limit, 10) : limit;
  if (parsed === undefined || parsed === null || Number.isNaN(parsed) || parsed <= 0) {
    return ACTIVITY_DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(parsed), ACTIVITY_MAX_LIMIT);
}

/** Integer literal for a kind rank. A bound parameter would be typed text inside UNION ALL. */
function rankLiteral(rank: number): Prisma.Sql {
  return Prisma.raw(`${rank}::int`);
}

interface ActivityRow {
  kind: ActivityKind;
  rank: number;
  id: string;
  marketId: string;
  ts: Date;
  side: string | null;
  amount: string | null;
  payout: string | null;
  reason: string | null;
}

/**
 * Keeps rows strictly after the cursor in feed order. `ts`, `id` are SQL column
 * expressions; `rank` is this branch's constant kind rank.
 */
function afterCursor(
  ts: string,
  id: string,
  rank: number,
  cursor: ActivityCursor | null
): Prisma.Sql {
  if (!cursor) return Prisma.sql`TRUE`;
  const cursorTs = new Date(cursor.ts);
  const rankSql = Prisma.raw(String(rank));
  return Prisma.sql`(
    ${Prisma.raw(ts)} < ${cursorTs}
    OR (${Prisma.raw(ts)} = ${cursorTs} AND ${Prisma.raw(id)} < ${cursor.id})
    OR (${Prisma.raw(ts)} = ${cursorTs} AND ${Prisma.raw(id)} = ${cursor.id} AND ${rankSql} < ${cursor.rank})
  )`;
}

/**
 * One SQL statement for the whole feed. Each branch reads one source with the
 * cursor applied and is capped at `n` rows, so the outer query only merges at
 * most 4n rows. The outer ORDER BY runs in the same database as the cursor
 * comparisons, so the two cannot disagree on text collation.
 *
 * Sources:
 *   bet_placed        Bet rows by placedAt                     (Bet_bettor_placedAt_idx)
 *   winnings_claimed  claimed bets on the winning side         (Bet_bettor_claimedAt_idx)
 *   refund_claimed    claimed bets that did not win: market cancelled, drawn, or no contest
 *   dispute_raised    Dispute rows by raisedAt                 (Dispute_raisedBy_raisedAt_idx)
 */
function buildActivityQuery(
  address: string,
  n: number,
  cursor: ActivityCursor | null
): Prisma.Sql {
  const branches: Prisma.Sql[] = [
    Prisma.sql`(
      SELECT 'bet_placed'::text AS kind, ${rankLiteral(KIND_RANK.bet_placed)} AS rank, b."id" AS id,
             b."marketId" AS "marketId", b."placedAt" AS ts, b."side"::text AS side,
             b."amount"::text AS amount, NULL::text AS payout, NULL::text AS reason
      FROM "Bet" b
      WHERE b."bettor" = ${address} AND ${afterCursor('b."placedAt"', 'b."id"', KIND_RANK.bet_placed, cursor)}
      ORDER BY b."placedAt" DESC, b."id" DESC
      LIMIT ${n}
    )`,
    Prisma.sql`(
      SELECT 'winnings_claimed'::text AS kind, ${rankLiteral(KIND_RANK.winnings_claimed)} AS rank, b."id" AS id,
             b."marketId" AS "marketId", b."claimedAt" AS ts, b."side"::text AS side,
             b."amount"::text AS amount, b."payout"::text AS payout, NULL::text AS reason
      FROM "Bet" b
      JOIN "Market" m ON m."id" = b."marketId"
      WHERE b."bettor" = ${address}
        AND b."claimed" = true
        AND b."claimedAt" IS NOT NULL
        AND m."outcome"::text = b."side"::text
        AND ${afterCursor('b."claimedAt"', 'b."id"', KIND_RANK.winnings_claimed, cursor)}
      ORDER BY b."claimedAt" DESC, b."id" DESC
      LIMIT ${n}
    )`,
    Prisma.sql`(
      SELECT 'refund_claimed'::text AS kind, ${rankLiteral(KIND_RANK.refund_claimed)} AS rank, b."id" AS id,
             b."marketId" AS "marketId", b."claimedAt" AS ts, b."side"::text AS side,
             b."amount"::text AS amount, b."payout"::text AS payout, NULL::text AS reason
      FROM "Bet" b
      JOIN "Market" m ON m."id" = b."marketId"
      WHERE b."bettor" = ${address}
        AND b."claimed" = true
        AND b."claimedAt" IS NOT NULL
        AND (m."outcome" IS NULL OR m."outcome"::text <> b."side"::text)
        AND (m."status"::text = 'Cancelled' OR m."outcome"::text IN ('Draw', 'NoContest'))
        AND ${afterCursor('b."claimedAt"', 'b."id"', KIND_RANK.refund_claimed, cursor)}
      ORDER BY b."claimedAt" DESC, b."id" DESC
      LIMIT ${n}
    )`,
    Prisma.sql`(
      SELECT 'dispute_raised'::text AS kind, ${rankLiteral(KIND_RANK.dispute_raised)} AS rank, d."id" AS id,
             d."marketId" AS "marketId", d."raisedAt" AS ts, NULL::text AS side,
             NULL::text AS amount, NULL::text AS payout, d."reason" AS reason
      FROM "Dispute" d
      WHERE d."raisedBy" = ${address}
        AND ${afterCursor('d."raisedAt"', 'd."id"', KIND_RANK.dispute_raised, cursor)}
      ORDER BY d."raisedAt" DESC, d."id" DESC
      LIMIT ${n}
    )`,
  ];

  return Prisma.sql`
    SELECT * FROM (${Prisma.join(branches, " UNION ALL ")}) AS activity
    ORDER BY activity.ts DESC, activity.id DESC, activity.rank DESC
    LIMIT ${n}
  `;
}

function toActivityItem(row: ActivityRow): ActivityItem {
  const item: ActivityItem = {
    kind: row.kind,
    id: row.id,
    marketId: row.marketId,
    timestamp: row.ts.toISOString(),
  };
  if (row.side) item.side = row.side as ActivityItem["side"];
  if (row.amount !== null) item.amount = row.amount;
  if (row.payout !== null) item.payout = row.payout;
  if (row.reason !== null) item.reason = row.reason;
  return item;
}

/**
 * Unified portfolio activity for an address: bets placed, winnings claimed,
 * refunds claimed and disputes raised, newest first.
 *
 * - An empty address returns an empty page without querying.
 * - Pages are stable under concurrent inserts: the cursor is the last item's
 *   (timestamp, id, kind rank), not an offset.
 * - Throws InvalidActivityCursorError when the cursor is malformed.
 */
export async function getUserActivity(
  address: string,
  options?: { cursor?: string | null; limit?: number | string | null }
): Promise<ActivityPage> {
  if (!address || address.trim() === "") {
    return { items: [], nextCursor: null };
  }

  const limit = normalizeActivityLimit(options?.limit);
  const cursor = decodeActivityCursor(options?.cursor);

  // Fetch one extra row to learn whether a next page exists.
  const rows = await prisma.$queryRaw<ActivityRow[]>(
    buildActivityQuery(address, limit + 1, cursor)
  );

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeActivityCursor({ ts: last.ts.toISOString(), id: last.id, rank: last.rank })
      : null;

  return { items: pageRows.map(toActivityItem), nextCursor };
}
