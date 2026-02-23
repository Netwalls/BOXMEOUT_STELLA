// Transaction service - business logic for transaction management
import { TransactionType, TransactionStatus } from '@prisma/client';
import { prisma } from '../database/prisma.js';

export class TransactionService {
  async recordTransaction(data: {
    userId: string;
    txType: TransactionType;
    amountUsdc: number;
    txHash: string;
    fromAddress: string;
    toAddress: string;
  }) {
    // Check if transaction already exists
    const existing = await prisma.transaction.findFirst({
      where: { txHash: data.txHash },
    });

    if (existing) {
      throw new Error('Transaction already recorded');
    }

    return await prisma.transaction.create({
      data: {
        userId: data.userId,
        txType: data.txType,
        amountUsdc: data.amountUsdc,
        txHash: data.txHash,
        fromAddress: data.fromAddress,
        toAddress: data.toAddress,
        status: TransactionStatus.PENDING,
      },
    });
  }

  async getTransactionHistory(
    userId: string,
    options?: {
      page?: number;
      limit?: number;
      txType?: TransactionType;
      status?: TransactionStatus;
      startDate?: string;
      endDate?: string;
    }
  ) {
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (options?.txType) {
      where.txType = options.txType;
    }

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.startDate || options?.endDate) {
      where.createdAt = {};
      if (options.startDate) {
        where.createdAt.gte = new Date(options.startDate);
      }
      if (options.endDate) {
        where.createdAt.lte = new Date(options.endDate);
      }
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ]);

    return {
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async confirmTransaction(txId: string) {
    return await prisma.transaction.update({
      where: { id: txId },
      data: {
        status: TransactionStatus.CONFIRMED,
        confirmedAt: new Date(),
      },
    });
  }

  async failTransaction(txId: string, reason: string) {
    return await prisma.transaction.update({
      where: { id: txId },
      data: {
        status: TransactionStatus.FAILED,
        failedReason: reason,
      },
    });
  }

  async getTransactionById(txId: string) {
    const transaction = await prisma.transaction.findUnique({
      where: { id: txId },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    return transaction;
  }

  async getPendingTransactions(userId?: string) {
    const where: any = { status: TransactionStatus.PENDING };
    if (userId) {
      where.userId = userId;
    }

    return await prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
  }
}
