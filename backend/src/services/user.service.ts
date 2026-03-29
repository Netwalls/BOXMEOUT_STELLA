// User service - business logic for user management
import bcrypt from 'bcrypt';
import { UserRepository } from '../repositories/user.repository.js';
import { UserTier } from '@prisma/client';
import { executeTransaction } from '../database/transaction.js';
import {
  notificationService,
  NotificationService,
} from './notification.service.js';
import { logger } from '../utils/logger.js';
import { stripHtml } from '../schemas/validation.schemas.js';
import { sessionService } from './session.service.js';

export class UserService {
  private userRepository: UserRepository;
  private notificationService: NotificationService;

  constructor(
    userRepository?: UserRepository,
    notificationSvc?: NotificationService
  ) {
    this.userRepository = userRepository || new UserRepository();
    this.notificationService = notificationSvc || notificationService;
  }

  async registerUser(data: {
    email: string;
    username: string;
    password: string;
    displayName?: string;
  }) {
    const existingEmail = await this.userRepository.findByEmail(data.email);
    if (existingEmail) throw new Error('Email already registered');

    const existingUsername = await this.userRepository.findByUsername(data.username);
    if (existingUsername) throw new Error('Username already taken');

    if (data.password.length < 8) throw new Error('Password must be at least 8 characters');

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await this.userRepository.createUser({
      email: data.email,
      username: data.username,
      passwordHash,
      displayName: data.displayName,
    });

    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async authenticateUser(emailOrUsername: string, password: string) {
    let user = await this.userRepository.findByEmail(emailOrUsername);
    if (!user) user = await this.userRepository.findByUsername(emailOrUsername);
    if (!user) throw new Error('Invalid credentials');

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) throw new Error('Invalid credentials');

    await this.userRepository.updateLastLogin(user.id);

    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async getUserProfile(userId: string) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new Error('User not found');

    const stats = await this.userRepository.getUserStats(userId);
    const { passwordHash: _, twoFaSecret: __, ...userWithoutSensitive } = user;
    return { ...userWithoutSensitive, stats };
  }

  /**
   * Public profile for any user (issue #35)
   */
  async getPublicProfile(userId: string) {
    const profile = await this.userRepository.getPublicProfile(userId);
    if (!profile) throw new Error('User not found');
    return profile;
  }

  /**
   * Full profile for authenticated user (issue #35)
   */
  async getMyProfile(userId: string) {
    const profile = await this.userRepository.getFullProfile(userId);
    if (!profile) throw new Error('User not found');
    return profile;
  }

  async updateProfile(
    userId: string,
    data: {
      username?: string;
      displayName?: string;
      bio?: string;
      avatarUrl?: string;
    }
  ) {
    const sanitizedData = { ...data };
    if (sanitizedData.username) sanitizedData.username = stripHtml(sanitizedData.username);
    if (sanitizedData.displayName) sanitizedData.displayName = stripHtml(sanitizedData.displayName);
    if (sanitizedData.bio) sanitizedData.bio = stripHtml(sanitizedData.bio);

    if (sanitizedData.username) {
      const existing = await this.userRepository.findByUsername(sanitizedData.username);
      if (existing && existing.id !== userId) throw new Error('Username already in use');
    }

    const user = await this.userRepository.update(userId, sanitizedData);
    const { passwordHash: _, twoFaSecret: __, ...userWithoutSensitive } = user;
    return userWithoutSensitive;
  }

  async connectWallet(userId: string, walletAddress: string) {
    const existing = await this.userRepository.findByWalletAddress(walletAddress);
    if (existing && existing.id !== userId) {
      throw new Error('Wallet already connected to another account');
    }
    return await this.userRepository.updateWalletAddress(userId, walletAddress);
  }

  async updateBalance(userId: string, usdcBalance?: number, xlmBalance?: number) {
    return await this.userRepository.updateBalance(userId, usdcBalance, xlmBalance);
  }

  async calculateAndUpdateTier(userId: string) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new Error('User not found');

    const stats = await this.userRepository.getUserStats(userId);
    const { predictionCount, winRate } = stats;

    let newTier: UserTier = UserTier.BEGINNER;
    if (predictionCount >= 500 && winRate >= 75) {
      newTier = UserTier.LEGENDARY;
    } else if (predictionCount >= 200 && winRate >= 65) {
      newTier = UserTier.EXPERT;
    } else if (predictionCount >= 50 && winRate >= 60) {
      newTier = UserTier.ADVANCED;
    }

    if (newTier !== user.tier) {
      const updatedUser = await this.userRepository.updateTier(userId, newTier);
      const tierLevels = {
        [UserTier.BEGINNER]: 0,
        [UserTier.ADVANCED]: 1,
        [UserTier.EXPERT]: 2,
        [UserTier.LEGENDARY]: 3,
      };
      if (tierLevels[newTier] > tierLevels[user.tier]) {
        logger.info('User promoted to new tier', { userId, oldTier: user.tier, newTier });
        await this.notificationService.createTierUpgradeNotification(userId, user.tier, newTier);
      }
      return updatedUser;
    }

    return user;
  }

  async searchUsers(query: string, limit: number = 10) {
    return await this.userRepository.searchUsers(query, limit);
  }

  async getUserStats(userId: string) {
    return await this.userRepository.getUserStats(userId);
  }

  // ============================================================
  // Admin methods (issue #37)
  // ============================================================

  /**
   * Paginated user list with filters
   */
  async listUsers(params: {
    page?: number;
    limit?: number;
    role?: UserTier;
    status?: 'active' | 'suspended';
    search?: string;
  }) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 100);
    return await this.userRepository.listUsers({ ...params, page, limit });
  }

  /**
   * Suspend a user and invalidate all their sessions
   */
  async suspendUser(userId: string) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new Error('User not found');

    await this.userRepository.suspendUser(userId);
    // Invalidate all active sessions
    await sessionService.deleteAllUserSessions(userId);

    logger.info('User suspended', { userId });
    return { success: true };
  }

  /**
   * Update user role
   */
  async updateUserRole(userId: string, role: UserTier) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new Error('User not found');

    return await this.userRepository.updateRole(userId, role);
  }
}
