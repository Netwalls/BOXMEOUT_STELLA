// Integration tests for UserRepository
import { describe, it, expect } from 'vitest';
import { UserRepository } from '../../src/repositories/user.repository.js';

describe('UserRepository Integration Tests', () => {
  const userRepo = new UserRepository();

  describe('createUser', () => {
    it('should create a new user', async () => {
      const timestamp = Date.now();
      const userData = {
        email: `test-${timestamp}@example.com`,
        username: `testuser-${timestamp}`,
        passwordHash: 'hashed_password',
        displayName: 'Test User',
      };

      const user = await userRepo.createUser(userData);

      expect(user).toBeDefined();
      expect(user.email).toBe(userData.email);
      expect(user.username).toBe(userData.username);
      expect(user.displayName).toBe(userData.displayName);
      expect(user.usdcBalance).toBeDefined();
    });
  });

  describe('findByEmail', () => {
    it('should find user by email', async () => {
      const timestamp = Date.now();
      const userData = {
        email: `find-${timestamp}@example.com`,
        username: `finduser-${timestamp}`,
        passwordHash: 'hashed_password',
      };

      await userRepo.createUser(userData);
      const found = await userRepo.findByEmail(userData.email);

      expect(found).toBeDefined();
      expect(found?.email).toBe(userData.email);
    });

    it('should return null for non-existent email', async () => {
      const found = await userRepo.findByEmail(
        `nonexistent-${Date.now()}@example.com`
      );
      expect(found).toBeNull();
    });
  });

  describe('findByUsername', () => {
    it('should find user by username', async () => {
      const timestamp = Date.now();
      const userData = {
        email: `user-${timestamp}@example.com`,
        username: `uniqueuser-${timestamp}`,
        passwordHash: 'hashed_password',
      };

      await userRepo.createUser(userData);
      const found = await userRepo.findByUsername(userData.username);

      expect(found).toBeDefined();
      expect(found?.username).toBe(userData.username);
    });
  });

  describe('updateBalance', () => {
    it('should update user USDC balance', async () => {
      const timestamp = Date.now();
      const user = await userRepo.createUser({
        email: `balance-${timestamp}@example.com`,
        username: `balanceuser-${timestamp}`,
        passwordHash: 'hashed_password',
      });

      const updated = await userRepo.updateBalance(user.id, 1000);

      expect(Number(updated.usdcBalance)).toBe(1000);
    });

    it('should update user XLM balance', async () => {
      const timestamp = Date.now();
      const user = await userRepo.createUser({
        email: `xlm-${timestamp}@example.com`,
        username: `xlmuser-${timestamp}`,
        passwordHash: 'hashed_password',
      });

      const updated = await userRepo.updateBalance(user.id, undefined, 500);

      expect(Number(updated.xlmBalance)).toBe(500);
    });
  });

  describe('updateWalletAddress', () => {
    it('should update wallet address', async () => {
      const timestamp = Date.now();
      const user = await userRepo.createUser({
        email: `wallet-${timestamp}@example.com`,
        username: `walletuser-${timestamp}`,
        passwordHash: 'hashed_password',
      });

      const walletAddress = `GTEST${timestamp}ABCDEFGHIJKLMNOPQRSTUVWXYZ`;
      const updated = await userRepo.updateWalletAddress(
        user.id,
        walletAddress
      );

      expect(updated.walletAddress).toBe(walletAddress);
    });
  });

  describe('updateTier', () => {
    it('should update user tier', async () => {
      const timestamp = Date.now();
      const user = await userRepo.createUser({
        email: `tier-${timestamp}@example.com`,
        username: `tieruser-${timestamp}`,
        passwordHash: 'hashed_password',
      });

      const updated = await userRepo.updateTier(user.id, 'EXPERT');

      expect(updated.tier).toBe('EXPERT');
    });
  });

  describe('searchUsers', () => {
    it('should search users by username', async () => {
      const timestamp = Date.now();
      await userRepo.createUser({
        email: `search1-${timestamp}@example.com`,
        username: `wrestler_john_${timestamp}`,
        passwordHash: 'hashed_password',
      });

      await userRepo.createUser({
        email: `search2-${timestamp}@example.com`,
        username: `wrestler_jane_${timestamp}`,
        passwordHash: 'hashed_password',
      });

      const results = await userRepo.searchUsers('wrestler');

      expect(results.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getUserStats', () => {
    it('should return user statistics', async () => {
      const user = await userRepo.createUser({
        email: `stats-${Date.now()}@example.com`,
        username: `statsuser-${Date.now()}`,
        passwordHash: 'hashed_password',
      });

      const stats = await userRepo.getUserStats(user.id);

      expect(stats).toBeDefined();
      expect(stats.user).toBeDefined();
      expect(stats.predictionCount).toBe(0);
      expect(stats.winCount).toBe(0);
      expect(stats.lossCount).toBe(0);
    });
  });
});
