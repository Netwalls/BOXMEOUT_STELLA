/**
 * B-133 (#1569): persisted market notifications.
 *
 * The indexer calls `fanOutMarketNotifications` inside the same transaction as
 * a MarketResolved, MarketCancelled, DisputeRaised or DisputeResolved event, so
 * every distinct bettor on the market gets one row. Replaying the same event
 * produces the same `dedupeKey`s and `skipDuplicates` ignores them, so the
 * fan-out is idempotent.
 *
 * Retention: rows older than NOTIFICATION_RETENTION_DAYS (default 90) are
 * removed by `pruneNotificationsOlderThan`. It is exposed for the retention
 * job and is safe to run repeatedly.
 */
import { NotificationType, Prisma, PrismaClient } from "@prisma/client";
import { db } from "../db";

export const NOTIFICATION_RETENTION_DAYS = Number(
  process.env.NOTIFICATION_RETENTION_DAYS ?? 90,
);
export const NOTIFICATION_PAGE_SIZE = 20;
export const NOTIFICATION_MAX_PAGE_SIZE = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Maps a canonical indexer event type to the notification it produces, if any. */
export function toNotificationType(canonicalType: string): NotificationType | undefined {
  switch (canonicalType) {
    case "MarketResolved":
      return NotificationType.MarketResolved;
    case "MarketCancelled":
      return NotificationType.MarketCancelled;
    case "DisputeRaised":
      return NotificationType.DisputeRaised;
    case "DisputeResolved":
      return NotificationType.DisputeResolved;
    default:
      return undefined;
  }
}

export interface FanOutInput {
  type: NotificationType;
  marketId: string;
  txHash: string;
  payload: Prisma.InputJsonValue;
}

/**
 * Builds one row per distinct bettor. The dedupe key combines the recipient,
 * type, market and transaction, so a replayed event maps to the same keys.
 */
export function buildNotificationRows(
  bettors: string[],
  input: FanOutInput,
): Prisma.NotificationCreateManyInput[] {
  const unique = Array.from(new Set(bettors));
  return unique.map((address) => ({
    address,
    type: input.type,
    marketId: input.marketId,
    payload: input.payload,
    dedupeKey: `${address}:${input.type}:${input.marketId}:${input.txHash}`,
  }));
}

/**
 * Writes notifications for every distinct bettor on `input.marketId`.
 * Pass the transaction client so the rows commit with the event.
 * Returns the number of rows actually inserted.
 */
export async function fanOutMarketNotifications(
  tx: PrismaClient,
  input: FanOutInput,
): Promise<number> {
  const bets = await tx.bet.findMany({
    where: { marketId: input.marketId },
    distinct: ["bettor"],
    select: { bettor: true },
  });

  const rows = buildNotificationRows(
    bets.map((bet) => bet.bettor),
    input,
  );
  if (rows.length === 0) return 0;

  const result = await tx.notification.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}

export interface ListNotificationsOptions {
  unreadOnly?: boolean;
  cursor?: string;
  limit?: number;
}

export interface NotificationPage {
  items: Array<{
    id: string;
    type: NotificationType;
    marketId: string;
    payload: Prisma.JsonValue;
    readAt: Date | null;
    createdAt: Date;
  }>;
  nextCursor: string | null;
}

/**
 * Cursor-paginated list, newest first. The cursor is the id of the last row
 * returned; `(createdAt, id)` ordering keeps pages stable when rows share a
 * timestamp.
 */
export async function listNotifications(
  address: string,
  options: ListNotificationsOptions = {},
  client: PrismaClient = db,
): Promise<NotificationPage> {
  const limit = Math.min(options.limit ?? NOTIFICATION_PAGE_SIZE, NOTIFICATION_MAX_PAGE_SIZE);

  const rows = await client.notification.findMany({
    where: {
      address,
      ...(options.unreadOnly ? { readAt: null } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: page.map((row) => ({
      id: row.id,
      type: row.type,
      marketId: row.marketId,
      payload: row.payload,
      readAt: row.readAt,
      createdAt: row.createdAt,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

/**
 * Marks notifications read for one owner. With `ids`, only those rows are
 * touched; without it, every unread row for the owner is marked. The address
 * filter means one wallet cannot mark another wallet's rows.
 * Returns the number of rows updated.
 */
export async function markNotificationsRead(
  address: string,
  ids?: string[],
  client: PrismaClient = db,
  now: Date = new Date(),
): Promise<number> {
  const result = await client.notification.updateMany({
    where: {
      address,
      readAt: null,
      ...(ids ? { id: { in: ids } } : {}),
    },
    data: { readAt: now },
  });
  return result.count;
}

/**
 * Deletes notifications created before `now - days`. Returns the count removed.
 */
export async function pruneNotificationsOlderThan(
  days: number = NOTIFICATION_RETENTION_DAYS,
  client: PrismaClient = db,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - days * DAY_MS);
  const result = await client.notification.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}
