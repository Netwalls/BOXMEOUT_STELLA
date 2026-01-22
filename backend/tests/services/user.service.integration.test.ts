// Integration tests for UserService
import { describe, it, expect } from 'vitest';
import { UserService } from '../../src/services/user.service.js';

describe('UserService Integration Tests', () => {
  const userService = new UserService();

  describe('registerUser', () => {
    it('should register a new user with hashed password', async () => {
      const timestamp = Date.now();
      const userData = {
        email: `newuser-${timestamp}@example.com`,
        username: `newuser-${timestamp}`,
        password: 'SecurePass123!',
        displayName: 'New User',
      };

      const user = await userService.registerUser(userData);

      expect(user).toBeDefined();
      expect(user.email).toBe(userData.email);
      expect(user.username).toBe(userData.username);
      expect(user.displayName).toBe(userData.displayName);
      expect((user as any).passwordHash).toBeUndefined(); // Should not return password
    });

    it('should reject duplicate email', async () => {
      const timestamp = Date.now();
      const userData = {
        email: `duplicate-${timestamp}@example.com`,
        username: `user1-${timestamp}`,
        password: 'SecurePass123!',
      };

      await userService.registerUser(userData);

      await expect(
        userService.registerUser({
          ...userData,
          username: `user2-${timestamp}`,
        })
      ).rejects.toThrow('Email already registered');
    });

    it('should reject duplicate username', async () => {
      const timestamp = Date.now();
      const userData = {
        email: `user1-${timestamp}@example.com`,
        username: `duplicateuser-${timestamp}`,
        password: 'SecurePass123!',
      };

      await userService.registerUser(userData);

      await expect(
        userService.registerUser({
          email: `user2-${timestamp}@example.com`,
          username: `duplicateuser-${timestamp}`,
          password: 'SecurePass123!',
        })
      ).rejects.toThrow('Username already taken');
    });

    it('should reject weak password', async () => {
      await expect(
        userService.registerUser({
          email: `weak-${Date.now()}@example.com`,
          username: `weakuser-${Date.now()}`,
          password: 'short',
        })
      ).rejects.toThrow('Password must be at least 8 characters');
    });
  });

  describe('authenticateUser', () => {
    it('should authenticate with correct credentials', async () => {
      const timestamp = Date.now();
      const password = 'CorrectPass123!';
      await userService.registerUser({
        email: `auth-${timestamp}@example.com`,
        username: `authuser-${timestamp}`,
        password,
      });

      const user = await userService.authenticateUser(`auth-${timestamp}@example.com`, password);

      expect(user).toBeDefined();
      expect(user.email).toBe(`auth-${timestamp}@example.com`);
    });

    it('should authenticate with username', async () => {
      const timestamp = Date.now();
      const password = 'CorrectPass123!';
      await userService.registerUser({
        email: `authuser-${timestamp}@example.com`,
        username: `authusername-${timestamp}`,
        password,
      });

      const user = await userService.authenticateUser(`authusername-${timestamp}`, password);

      expect(user).toBeDefined();
      expect(user.username).toBe(`authusername-${timestamp}`);
    });

    it('should reject incorrect password', async () => {
      const timestamp = Date.now();
      await userService.registerUser({
        email: `wrongpass-${timestamp}@example.com`,
        username: `wrongpass-${timestamp}`,
        password: 'CorrectPass123!',
      });

      await expect(
        userService.authenticateUser(`wrongpass-${timestamp}@example.com`, 'WrongPassword')
      ).rejects.toThrow('Invalid credentials');
    });

    it('should reject non-existent user', async () => {
      await expect(
        userService.authenticateUser(`nonexistent-${Date.now()}@example.com`, 'AnyPassword')
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('getUserProfile', () => {
    it('should return user profile with stats', async () => {
      const timestamp = Date.now();
      const user = await userService.registerUser({
        email: `profile-${timestamp}@example.com`,
        username: `profileuser-${timestamp}`,
        password: 'SecurePass123!',
      });

      const profile = await userService.getUserProfile(user.id);

      expect(profile).toBeDefined();
      expect(profile.email).toBe(`profile-${timestamp}@example.com`);
      expect(profile.stats).toBeDefined();
      expect(profile.stats.predictionCount).toBe(0);
      expect((profile as any).passwordHash).toBeUndefined();
    });
  });

  describe('updateProfile', () => {
    it('should update user profile', async () => {
      const timestamp = Date.now();
      const user = await userService.registerUser({
        email: `update-${timestamp}@example.com`,
        username: `updateuser-${timestamp}`,
        password: 'SecurePass123!',
      });

      const updated = await userService.updateProfile(user.id, {
        displayName: 'Updated Name',
        bio: 'This is my bio',
      });

      expect(updated.displayName).toBe('Updated Name');
      expect(updated.bio).toBe('This is my bio');
    });

    it('should reject duplicate username on update', async () => {
      const timestamp = Date.now();
      const user1 = await userService.registerUser({
        email: `user1-${timestamp}@example.com`,
        username: `user1-${timestamp}`,
        password: 'SecurePass123!',
      });

      const user2 = await userService.registerUser({
        email: `user2-${timestamp}@example.com`,
        username: `user2-${timestamp}`,
        password: 'SecurePass123!',
      });

      await expect(
        userService.updateProfile(user2.id, { username: `user1-${timestamp}` })
      ).rejects.toThrow('Username already taken');
    });
  });

  describe('connectWallet', () => {
    it('should connect wallet address to user', async () => {
      const timestamp = Date.now();
      const user = await userService.registerUser({
        email: `wallet-${timestamp}@example.com`,
        username: `walletuser-${timestamp}`,
        password: 'SecurePass123!',
      });

      const walletAddress = `GWALLET${timestamp}ABCDEFGHIJKLMNOPQRSTUVWXYZ`;
      const updated = await userService.connectWallet(user.id, walletAddress);

      expect(updated.walletAddress).toBe(walletAddress);
    });

    it('should reject wallet already connected to another user', async () => {
      const timestamp = Date.now();
      const user1 = await userService.registerUser({
        email: `wallet1-${timestamp}@example.com`,
        username: `wallet1-${timestamp}`,
        password: 'SecurePass123!',
      });

      const user2 = await userService.registerUser({
        email: `wallet2-${timestamp}@example.com`,
        username: `wallet2-${timestamp}`,
        password: 'SecurePass123!',
      });

      const walletAddress = `GSHARED${timestamp}ABCDEFGHIJKLMNOPQRSTUVWXYZ`;
      await userService.connectWallet(user1.id, walletAddress);

      await expect(
        userService.connectWallet(user2.id, walletAddress)
      ).rejects.toThrow('Wallet already connected to another account');
    });
  });

  describe('searchUsers', () => {
    it('should search users by username', async () => {
      const timestamp = Date.now();
      await userService.registerUser({
        email: `fighter1-${timestamp}@example.com`,
        username: `fighter_john_${timestamp}`,
        password: 'SecurePass123!',
      });

      await userService.registerUser({
        email: `fighter2-${timestamp}@example.com`,
        username: `fighter_jane_${timestamp}`,
        password: 'SecurePass123!',
      });

      await userService.registerUser({
        email: `other-${timestamp}@example.com`,
        username: `otheruser_${timestamp}`,
        password: 'SecurePass123!',
      });

      const results = await userService.searchUsers('fighter');

      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.some((u: any) => u.username.includes('fighter'))).toBe(true);
    });
  });
});
