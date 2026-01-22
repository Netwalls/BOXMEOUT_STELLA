// Transaction helper utilities for atomic operations
import { PrismaClient } from '@prisma/client';
import { prisma } from './prisma.js';

export type TransactionCallback<T> = (tx: PrismaClient) => Promise<T>;

/**
 * Execute operations within a database transaction
 * Automatically rolls back on error
 */
export async function executeTransaction<T>(
  callback: TransactionCallback<T>
): Promise<T> {
  return await prisma.$transaction(async (tx) => {
    return await callback(tx as PrismaClient);
  });
}

/**
 * Execute multiple operations in a transaction with retry logic
 */
export async function executeTransactionWithRetry<T>(
  callback: TransactionCallback<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await executeTransaction(callback);
    } catch (error) {
      lastError = error as Error;
      console.warn(`Transaction attempt ${attempt} failed:`, error);

      if (attempt < maxRetries) {
        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 100));
      }
    }
  }

  throw new Error(
    `Transaction failed after ${maxRetries} attempts: ${lastError?.message}`
  );
}

/**
 * Batch operations helper
 */
export async function batchOperation<T, R>(
  items: T[],
  operation: (item: T, tx: PrismaClient) => Promise<R>,
  batchSize: number = 100
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    const batchResults = await executeTransaction(async (tx) => {
      return await Promise.all(batch.map((item) => operation(item, tx)));
    });

    results.push(...batchResults);
  }

  return results;
}
