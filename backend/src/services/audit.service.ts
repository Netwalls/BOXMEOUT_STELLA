import { Prisma, PrismaClient } from "@prisma/client";

/** Rows deleted per statement, so a large backlog never holds one long delete. */
export const PRUNE_BATCH_SIZE = 1000;

export interface AuditLogQuery {
  page?: number;
  limit?: number;
  userId?: string;
  actionType?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Keys whose values must never be persisted in audit log bodies.
 */
const REDACTED_KEYS = [
  "password",
  "passwordhash",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "apikey",
  "api_key",
  "authorization",
  "privatekey",
  "private_key",
  "mnemonic",
  "seed",
  "cookie",
];

const REDACTED_PLACEHOLDER = "[REDACTED]";

/**
 * Recursively redact secret-looking fields from an arbitrary value so that
 * request bodies can be safely persisted in audit rows.
 */
export function redactSecrets(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (REDACTED_KEYS.includes(key.toLowerCase())) {
        result[key] = REDACTED_PLACEHOLDER;
      } else {
        result[key] = redactSecrets(val);
      }
    }
    return result;
  }

  return value;
}

/**
 * Build a JSON diff (before/after) for an admin action, redacting secrets.
 */
export function buildAuditDiff(before: unknown, after: unknown) {
  return {
    before: redactSecrets(before ?? null),
    after: redactSecrets(after ?? null),
  };
}

/**
 * Get audit logs with pagination and filtering
 */
export async function getAuditLogs(query: AuditLogQuery) {
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(100, Math.max(1, query.limit || 20));
  const skip = (page - 1) * limit;

  const where: Prisma.AuditLogWhereInput = {};

  if (query.userId) {
    where.userId = query.userId;
  }

  if (query.actionType) {
    where.path = {
      contains: query.actionType,
    };
  }

  if (query.startDate || query.endDate) {
    const timestamp: Prisma.DateTimeFilter = {};
    if (query.startDate) {
      timestamp.gte = query.startDate;
    }
    if (query.endDate) {
      timestamp.lte = query.endDate;
    }
    where.timestamp = timestamp;
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: limit,
      skip,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get audit logs for a specific user
 */
export async function getUserAuditLogs(userId: string, limit: number = 50) {
  return prisma.auditLog.findMany({
    where: { userId },
    orderBy: { timestamp: "desc" },
    take: limit,
  });
}

/**
 * Get all audit logs for a date range
 */
export async function getAuditLogsByDateRange(startDate: Date, endDate: Date) {
  return prisma.auditLog.findMany({
    where: {
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { timestamp: "desc" },
  });
}

/**
 * Deletes rows in batches until none older than `cutoff` remain.
 * `findBatch` returns the ids of up to `batchSize` expired rows and
 * `deleteBatch` removes them. Returns the total number of rows deleted.
 */
async function pruneInBatches<T extends string | number>(
  findBatch: (cutoff: Date, batchSize: number) => Promise<T[]>,
  deleteBatch: (ids: T[]) => Promise<{ count: number }>,
  cutoff: Date,
  batchSize: number,
): Promise<number> {
  let deleted = 0;
  for (;;) {
    const ids = await findBatch(cutoff, batchSize);
    if (ids.length === 0) break;

    const result = await deleteBatch(ids);
    deleted += result.count;

    if (ids.length < batchSize) break;
  }
  return deleted;
}

/**
 * B-101: Deletes AuditLog rows whose timestamp is before `cutoff`.
 */
export function pruneAuditLogs(
  cutoff: Date,
  batchSize: number = PRUNE_BATCH_SIZE,
): Promise<number> {
  return pruneInBatches(
    async (before, take) => {
      const rows = await prisma.auditLog.findMany({
        where: { timestamp: { lt: before } },
        orderBy: { timestamp: "asc" },
        select: { id: true },
        take,
      });
      return rows.map((row) => row.id);
    },
    (ids) => prisma.auditLog.deleteMany({ where: { id: { in: ids } } }),
    cutoff,
    batchSize,
  );
}

/**
 * B-101: Deletes EventLog rows that were processed before `cutoff`.
 * Rows with a null `processedAt` are never deleted, so unprocessed events
 * are always kept for the indexer.
 */
export function pruneEventLogs(
  cutoff: Date,
  batchSize: number = PRUNE_BATCH_SIZE,
): Promise<number> {
  return pruneInBatches(
    async (before, take) => {
      const rows = await prisma.eventLog.findMany({
        where: { processedAt: { lt: before } },
        orderBy: { processedAt: "asc" },
        select: { id: true },
        take,
      });
      return rows.map((row) => row.id);
    },
    (ids) => prisma.eventLog.deleteMany({ where: { id: { in: ids } } }),
    cutoff,
    batchSize,
  );
}
