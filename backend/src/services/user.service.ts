// User service - business logic for user management
import bcrypt from 'bcrypt';
import { UserRepository } from '../repositories/user.repository.js';
import { UserTier } from '@prisma/client';
import { executeTransaction } from '../database/transaction.js';

export class UserService {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  async registerUser(data: {
    email: string;
    username: string;
    password: string;
    displayName?: string;
  }) {
    // Check if email already exists
    const existingEmail = await this.userRepository.findByEmail(data.email);
    if (existingEmail) {
      throw new Error('Email already registered');
    }

    // Check if username already exists
    const existingUsername = await this.userRepository.findByUsername(data.username);
    if (existingUsername) {
      throw new Error('Username already taken');
    }

    // Validate password strength
    if (data.password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 12);

    // Create user
    const user = await this.userRepository.createUser({
      email: data.email,
      username: data.username,
      passwordHash,
      displayName: data.displayName,
    });

    // Remove password hash from response
    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async authenticateUser(emailOrUsername: string, password: string) {
    // Find user by email or username
    let user = await this.userRepository.findByEmail(emailOrUsername);
    if (!user) {
      user = await this.userRepository.findByUsername(emailOrUsername);
    }

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    await this.userRepository.updateLastLogin(user.id);

    // Remove password hash from response
    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async getUserProfile(userId: string) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const stats = await this.userRepository.getUserStats(userId);

    const { passwordHash: _, twoFaSecret: __, ...userWithoutSensitive } = user;
    return {
      ...userWithoutSensitive,
      stats,
    };
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
    // Check username uniqueness if changing
    if (data.username) {
      const existing = await this.userRepository.findByUsername(data.username);
      if (existing && existing.id !== userId) {
        throw new Error('Username already taken');
      }
    }

    const user = await this.userRepository.update(userId, data);
    const { passwordHash: _, twoFaSecret: __, ...userWithoutSensitive } = user;
    return userWithoutSensitive;
  }

  async connectWallet(userId: string, walletAddress: string) {
    // Check if wallet already connected to another user
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
    const stats = await this.userRepository.getUserStats(userId);
    const { predictionCount, winRate } = stats;

    let newTier: UserTier = UserTier.BEGINNER;

    if (predictionCount >= 500 && winRate >= 75) {
      newTier = UserTier.LEGENDARY;
    } else if (predictionCount >= 100 && winRate >= 60) {
      newTier = UserTier.EXPERT;
    } else if (predictionCount >= 10 && winRate >= 40) {
      newTier = UserTier.ADVANCED;
    }

    return await this.userRepository.updateTier(userId, newTier);
  }

  async searchUsers(query: string, limit: number = 10) {
    return await this.userRepository.searchUsers(query, limit);
  }

  async getUserStats(userId: string) {
    return await this.userRepository.getUserStats(userId);
  }
}
