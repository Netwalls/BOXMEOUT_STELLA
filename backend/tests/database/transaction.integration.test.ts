// Integration tests for transaction utilities
import { describe, it, expect, beforeEach } from 'vitest';
import { executeTransaction, executeTransactionWithRetry } from '../../src/database/transaction.js';
import { UserRepository } from '../../src/repositories/user.repository.js';
import { MarketRepository } from '../../src/repositories/market.repository.js';
import { MarketCategory } from '@prisma/client';

describe('Transaction Utilities Integration Tests', () => {
  const userRepo = new UserRepository();
  const marketRepo = new MarketRepository();

  describe('executeTransaction', () => {
    it('should commit transaction on success', async () => {
      const result = await executeTransaction(async (tx) => {
        const userRepoTx = new UserRepository(tx);
        
        const user = await userRepoTx.createUser({
          email: `tx-success-${Date.now()}@example.com`,
          username: `txsuccess-${Date.now()}`,
          passwordHash: 'hashed_password',
        });

        return user;
      });

      expect(result).toBeDefined();
      expect(result.email).toContain('tx-success');

      // Verify user was actually created
      const found = await userRepo.findByEmail(result.email);
      expect(found).toBeDefined();
    });

    it('should rollback transaction on error', async () => {
      const email = `tx-rollback-${Date.now()}@example.com`;
      try {
        await executeTransaction(async (tx) => {
          const userRepoTx = new UserRepository(tx);
          
          await userRepoTx.createUser({
            email,
            username: `txrollback-${Date.now()}`,
            passwordHash: 'hashed_password',
          });

          // Throw error to trigger rollback
          throw new Error('Intentional error for rollback test');
        });
      } catch (error) {
        // Expected error
      }

      // Verify user was NOT created (transaction rolled back)
      const found = await userRepo.findByEmail(email);
      expect(found).toBeNull();
    });

    it('should handle multiple operations atomically', async () => {
      const user = await userRepo.createUser({
        email: `atomic-${Date.now()}@example.com`,
        username: `atomic-${Date.now()}`,
        passwordHash: 'hashed_password',
      });

      await executeTransaction(async (tx) => {
        const userRepoTx = new UserRepository(tx);
        const marketRepoTx = new MarketRepository(tx);

        // Update user balance
        await userRepoTx.updateBalance(user.id, 1000);

        // Create market
        await marketRepoTx.createMarket({
          contractAddress: `CONTRACT_ATOMIC_${Date.now()}`,
          title: 'Atomic Test Market',
          description: 'Test',
          category: MarketCategory.SPORTS,
          creatorId: user.id,
          outcomeA: 'Yes',
          outcomeB: 'No',
          closingAt: new Date(Date.now() + 86400000),
        });
      });

      // Verify both operations succeeded
      const updatedUser = await userRepo.findById(user.id);
      expect(Number(updatedUser?.usdcBalance)).toBe(1000);

      const markets = await marketRepo.findMarketsByCreator(user.id);
      expect(markets.length).toBeGreaterThan(0);
    });

    it('should rollback all operations on partial failure', async () => {
      const user = await userRepo.createUser({
        email: `partial-${Date.now()}@example.com`,
        username: `partial-${Date.now()}`,
        passwordHash: 'hashed_password',
      });

      const contractAddress = `CONTRACT_PARTIAL_${Date.now()}`;
      
      try {
        await executeTransaction(async (tx) => {
          const userRepoTx = new UserRepository(tx);
          const marketRepoTx = new MarketRepository(tx);

          // First operation succeeds
          await userRepoTx.updateBalance(user.id, 5000);

          // Second operation fails
          await marketRepoTx.createMarket({
            contractAddress,
            title: 'Partial Test Market',
            description: 'Test',
            category: MarketCategory.SPORTS,
            creatorId: user.id,
            outcomeA: 'Yes',
            outcomeB: 'No',
            closingAt: new Date(Date.now() + 86400000),
          });

          // Throw error after both operations
          throw new Error('Rollback both operations');
        });
      } catch (error) {
        // Expected error
      }

      // Verify first operation was rolled back
      const updatedUser = await userRepo.findById(user.id);
      expect(Number(updatedUser?.usdcBalance)).toBe(0);

      // Verify second operation was rolled back
      const market = await marketRepo.findByContractAddress(contractAddress);
      expect(market).toBeNull();
    });
  });

  describe('executeTransactionWithRetry', () => {
    it('should retry on failure and eventually succeed', async () => {
      let attemptCount = 0;

      const result = await executeTransactionWithRetry(async (tx) => {
        attemptCount++;
        
        if (attemptCount < 2) {
          throw new Error('Simulated transient failure');
        }

        const userRepoTx = new UserRepository(tx);
        return await userRepoTx.createUser({
          email: `retry-${Date.now()}@example.com`,
          username: `retry-${Date.now()}`,
          passwordHash: 'hashed_password',
        });
      }, 3);

      expect(result).toBeDefined();
      expect(attemptCount).toBe(2);
      expect(result.email).toContain('retry');
    });

    it('should throw after max retries exceeded', async () => {
      let attemptCount = 0;

      await expect(
        executeTransactionWithRetry(async () => {
          attemptCount++;
          throw new Error('Persistent failure');
        }, 3)
      ).rejects.toThrow('Transaction failed after 3 attempts');

      expect(attemptCount).toBe(3);
    });
  });
});
