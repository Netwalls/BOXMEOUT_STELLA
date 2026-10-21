import { db } from "../../db";
import { config } from "../../config";
import { pruneAuditLogs, pruneEventLogs, PRUNE_BATCH_SIZE } from "../audit.service";
import { runRetention } from "../retention.service";

jest.mock("../../db", () => ({
  db: {
    auditLog: { findMany: jest.fn(), deleteMany: jest.fn() },
    eventLog: { findMany: jest.fn(), deleteMany: jest.fn() },
  },
}));

const mockedDb = db as unknown as {
  auditLog: { findMany: jest.Mock; deleteMany: jest.Mock };
  eventLog: { findMany: jest.Mock; deleteMany: jest.Mock };
};

const DAY_MS = 24 * 60 * 60 * 1000;

function auditRows(count: number): { id: string }[] {
  return Array.from({ length: count }, (_, i) => ({ id: `audit-${i}` }));
}

describe("B-101: AuditLog and EventLog retention", () => {
  describe("pruneAuditLogs", () => {
    it("deletes in batches until a short page signals the backlog is empty", async () => {
      mockedDb.auditLog.findMany
        .mockResolvedValueOnce(auditRows(PRUNE_BATCH_SIZE))
        .mockResolvedValueOnce(auditRows(PRUNE_BATCH_SIZE))
        .mockResolvedValueOnce(auditRows(5));
      mockedDb.auditLog.deleteMany
        .mockResolvedValueOnce({ count: PRUNE_BATCH_SIZE })
        .mockResolvedValueOnce({ count: PRUNE_BATCH_SIZE })
        .mockResolvedValueOnce({ count: 5 });

      const deleted = await pruneAuditLogs(new Date("2026-01-01T00:00:00Z"));

      expect(deleted).toBe(2 * PRUNE_BATCH_SIZE + 5);
      expect(mockedDb.auditLog.findMany).toHaveBeenCalledTimes(3);
      expect(mockedDb.auditLog.deleteMany).toHaveBeenCalledTimes(3);
      expect(mockedDb.auditLog.deleteMany.mock.calls[0][0]).toEqual({
        where: { id: { in: auditRows(PRUNE_BATCH_SIZE).map((r) => r.id) } },
      });
    });

    it("only selects rows older than the cutoff, oldest first", async () => {
      mockedDb.auditLog.findMany.mockResolvedValueOnce([]);
      const cutoff = new Date("2026-01-01T00:00:00Z");

      await pruneAuditLogs(cutoff, 50);

      expect(mockedDb.auditLog.findMany).toHaveBeenCalledWith({
        where: { timestamp: { lt: cutoff } },
        orderBy: { timestamp: "asc" },
        select: { id: true },
        take: 50,
      });
      expect(mockedDb.auditLog.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe("pruneEventLogs", () => {
    it("only deletes processed rows, so unprocessed events are kept", async () => {
      mockedDb.eventLog.findMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
      mockedDb.eventLog.deleteMany.mockResolvedValueOnce({ count: 2 });
      const cutoff = new Date("2026-01-01T00:00:00Z");

      const deleted = await pruneEventLogs(cutoff, 10);

      expect(deleted).toBe(2);
      expect(mockedDb.eventLog.findMany.mock.calls[0][0].where).toEqual({
        processedAt: { lt: cutoff },
      });
      expect(mockedDb.eventLog.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2] } },
      });
    });
  });

  describe("runRetention", () => {
    it("applies each table's configured retention window relative to now", async () => {
      mockedDb.auditLog.findMany.mockResolvedValueOnce([]);
      mockedDb.eventLog.findMany.mockResolvedValueOnce([]);
      const now = new Date("2026-10-18T03:00:00Z");

      const result = await runRetention(now);

      expect(result).toEqual({ auditLogs: 0, eventLogs: 0 });
      expect(mockedDb.auditLog.findMany.mock.calls[0][0].where).toEqual({
        timestamp: {
          lt: new Date(now.getTime() - config.AUDIT_LOG_RETENTION_DAYS * DAY_MS),
        },
      });
      expect(mockedDb.eventLog.findMany.mock.calls[0][0].where).toEqual({
        processedAt: {
          lt: new Date(now.getTime() - config.EVENT_LOG_RETENTION_DAYS * DAY_MS),
        },
      });
    });

    it("reports rows pruned from each table", async () => {
      mockedDb.auditLog.findMany.mockResolvedValueOnce(auditRows(3));
      mockedDb.auditLog.deleteMany.mockResolvedValueOnce({ count: 3 });
      mockedDb.eventLog.findMany.mockResolvedValueOnce([{ id: 7 }]);
      mockedDb.eventLog.deleteMany.mockResolvedValueOnce({ count: 1 });

      await expect(runRetention()).resolves.toEqual({ auditLogs: 3, eventLogs: 1 });
    });
  });
});
