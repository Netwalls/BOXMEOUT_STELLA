/**
 * B-133 (#1569): notification fan-out, pagination, read state and retention.
 * The Prisma client is passed in explicitly, so these tests run without a database.
 */
import { NotificationType } from "@prisma/client";

jest.mock("../../db", () => ({ db: {} }));

import {
  buildNotificationRows,
  fanOutMarketNotifications,
  listNotifications,
  markNotificationsRead,
  pruneNotificationsOlderThan,
  toNotificationType,
  NOTIFICATION_MAX_PAGE_SIZE,
} from "../notification.service";

const input = {
  type: NotificationType.MarketResolved,
  marketId: "m1",
  txHash: "tx1",
  payload: { marketId: "m1", ledger: 10 },
};

describe("toNotificationType", () => {
  it("maps resolve, cancel and dispute events and ignores others", () => {
    expect(toNotificationType("MarketResolved")).toBe(NotificationType.MarketResolved);
    expect(toNotificationType("MarketCancelled")).toBe(NotificationType.MarketCancelled);
    expect(toNotificationType("DisputeRaised")).toBe(NotificationType.DisputeRaised);
    expect(toNotificationType("DisputeResolved")).toBe(NotificationType.DisputeResolved);
    expect(toNotificationType("BetPlaced")).toBeUndefined();
  });
});

describe("buildNotificationRows", () => {
  it("creates one row per distinct bettor with a stable dedupe key", () => {
    const rows = buildNotificationRows(["GA", "GB", "GA"], input);
    expect(rows.map((r) => r.address)).toEqual(["GA", "GB"]);
    expect(rows[0].dedupeKey).toBe(`GA:MarketResolved:m1:tx1`);
    expect(rows[0].marketId).toBe("m1");
  });
});

describe("fanOutMarketNotifications", () => {
  function fakeTx(bettors: string[], createCount: number) {
    return {
      bet: {
        findMany: jest.fn().mockResolvedValue(bettors.map((bettor) => ({ bettor }))),
      },
      notification: {
        createMany: jest.fn().mockResolvedValue({ count: createCount }),
      },
    } as unknown as Parameters<typeof fanOutMarketNotifications>[0] & {
      bet: { findMany: jest.Mock };
      notification: { createMany: jest.Mock };
    };
  }

  it("writes one notification per distinct bettor and uses skipDuplicates", async () => {
    const tx = fakeTx(["GA", "GB"], 2);
    const count = await fanOutMarketNotifications(tx, input);

    expect(tx.bet.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { marketId: "m1" }, distinct: ["bettor"] }),
    );
    const data = tx.notification.createMany.mock.calls[0][0].data;
    expect(data.map((r: { address: string }) => r.address)).toEqual(["GA", "GB"]);
    expect(tx.notification.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
    expect(count).toBe(2);
  });

  it("is idempotent on replay: the same event produces the same keys", async () => {
    const first = fakeTx(["GA", "GB"], 2);
    const replay = fakeTx(["GA", "GB"], 0);
    await fanOutMarketNotifications(first, input);
    const count = await fanOutMarketNotifications(replay, input);

    const firstKeys = first.notification.createMany.mock.calls[0][0].data.map(
      (r: { dedupeKey: string }) => r.dedupeKey,
    );
    const replayKeys = replay.notification.createMany.mock.calls[0][0].data.map(
      (r: { dedupeKey: string }) => r.dedupeKey,
    );
    expect(replayKeys).toEqual(firstKeys);
    expect(count).toBe(0);
  });

  it("writes nothing when the market has no bettors", async () => {
    const tx = fakeTx([], 0);
    expect(await fanOutMarketNotifications(tx, input)).toBe(0);
    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });
});

describe("listNotifications", () => {
  function fakeClient(rows: Array<{ id: string }>) {
    return {
      notification: { findMany: jest.fn().mockResolvedValue(rows) },
    } as unknown as Parameters<typeof listNotifications>[2] & {
      notification: { findMany: jest.Mock };
    };
  }
  const row = (id: string) => ({
    id,
    type: NotificationType.DisputeRaised,
    marketId: "m1",
    payload: {},
    readAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  });

  it("returns a nextCursor when there is another page", async () => {
    const client = fakeClient([row("a"), row("b"), row("c")]);
    const page = await listNotifications("GA", { limit: 2 }, client);
    expect(page.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(page.nextCursor).toBe("b");
  });

  it("returns a null cursor on the last page", async () => {
    const page = await listNotifications("GA", { limit: 5 }, fakeClient([row("a")]));
    expect(page.nextCursor).toBeNull();
  });

  it("applies the unread filter and caps the page size", async () => {
    const client = fakeClient([]);
    await listNotifications("GA", { unreadOnly: true, limit: 10_000 }, client);
    const args = client.notification.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ address: "GA", readAt: null });
    expect(args.take).toBe(NOTIFICATION_MAX_PAGE_SIZE + 1);
  });

  it("continues after the cursor without repeating it", async () => {
    const client = fakeClient([]);
    await listNotifications("GA", { cursor: "b" }, client);
    const args = client.notification.findMany.mock.calls[0][0];
    expect(args.cursor).toEqual({ id: "b" });
    expect(args.skip).toBe(1);
  });
});

describe("markNotificationsRead", () => {
  it("only updates unread rows owned by the address", async () => {
    const client = {
      notification: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
    } as unknown as Parameters<typeof markNotificationsRead>[2] & {
      notification: { updateMany: jest.Mock };
    };
    const now = new Date("2026-02-01T00:00:00Z");
    const count = await markNotificationsRead("GA", undefined, client, now);

    expect(client.notification.updateMany).toHaveBeenCalledWith({
      where: { address: "GA", readAt: null },
      data: { readAt: now },
    });
    expect(count).toBe(3);
  });

  it("restricts the update to the given ids", async () => {
    const client = {
      notification: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    } as unknown as Parameters<typeof markNotificationsRead>[2] & {
      notification: { updateMany: jest.Mock };
    };
    await markNotificationsRead("GA", ["n1"], client, new Date());
    expect(client.notification.updateMany.mock.calls[0][0].where).toEqual({
      address: "GA",
      readAt: null,
      id: { in: ["n1"] },
    });
  });
});

describe("pruneNotificationsOlderThan", () => {
  it("deletes rows older than the retention window", async () => {
    const client = {
      notification: { deleteMany: jest.fn().mockResolvedValue({ count: 4 }) },
    } as unknown as Parameters<typeof pruneNotificationsOlderThan>[1] & {
      notification: { deleteMany: jest.Mock };
    };
    const now = new Date("2026-06-01T00:00:00Z");
    const count = await pruneNotificationsOlderThan(30, client, now);

    expect(client.notification.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date("2026-05-02T00:00:00Z") } },
    });
    expect(count).toBe(4);
  });
});
