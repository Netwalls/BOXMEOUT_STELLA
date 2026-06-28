import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface AuditLogQuery {
  page?: number;
  limit?: number;
  userId?: string;
  actionType?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Get audit logs with pagination and filtering
 */
export async function getAuditLogs(query: AuditLogQuery) {
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(100, Math.max(1, query.limit || 20));
  const skip = (page - 1) * limit;

  const where: any = {};

  if (query.userId) {
    where.userId = query.userId;
  }

  if (query.actionType) {
    where.path = {
      contains: query.actionType,
    };
  }

  if (query.startDate || query.endDate) {
    where.timestamp = {};
    if (query.startDate) {
      where.timestamp.gte = query.startDate;
    }
    if (query.endDate) {
      where.timestamp.lte = query.endDate;
    }
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
