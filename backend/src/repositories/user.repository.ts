// User repository - data access layer for users
import { User, UserTier, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

export class UserRepository extends BaseRepository<User> {
  getModelName(): string {
    return 'user';
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findByUsername(username: string): Promise<User | null> {
    return await this.prisma.user.findUnique({
      where: { username },
    });
  }

  async findByWalletAddress(walletAddress: string): Promise<User | null> {
    return await this.prisma.user.findUnique({
      where: { walletAddress },
    });
  }

  async createUser(data: {
    email: string;
    username: string;
    passwordHash: string;
    displayName?: string;
  }): Promise<User> {
    return await this.prisma.user.create({
      data,
    });
  }

  async updateBalance(
    userId: string,
    usdcBalance?: number,
    xlmBalance?: number
  ): Promise<User> {
    const updateData: any = {};
    if (usdcBalance !== undefined) updateData.usdcBalance = usdcBalance;
    if (xlmBalance !== undefined) updateData.xlmBalance = xlmBalance;

    return await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });
  }

  async updateWalletAddress(userId: string, walletAddress: string): Promise<User> {
    return await this.prisma.user.update({
      where: { id: userId },
      data: { walletAddress },
    });
  }

  async updateTier(userId: string, tier: UserTier): Promise<User> {
    return await this.prisma.user.update({
      where: { id: userId },
      data: { tier },
    });
  }

  async updateLastLogin(userId: string): Promise<User> {
    return await this.prisma.user.update({
      where: { id: userId },
      data: { lastLogin: new Date() },
    });
  }

  async searchUsers(query: string, limit: number = 10): Promise<User[]> {
    return await this.prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { displayName: { contains: query, mode: 'insensitive' } },
        ],
        isActive: true,
      },
      take: limit,
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        tier: true,
        reputationScore: true,
        createdAt: true,
      } as any,
    });
  }

  async getUserStats(userId: string) {
    const [user, predictionCount, winCount, totalPnl] = await Promise.all([
      this.findById(userId),
      this.prisma.prediction.count({
        where: { userId, status: 'SETTLED' },
      }),
      this.prisma.prediction.count({
        where: { userId, status: 'SETTLED', isWinner: true },
      }),
      this.prisma.prediction.aggregate({
        where: { userId, status: 'SETTLED' },
        _sum: { pnlUsd: true },
      }),
    ]);

    return {
      user,
      predictionCount,
      winCount,
      lossCount: predictionCount - winCount,
      winRate: predictionCount > 0 ? (winCount / predictionCount) * 100 : 0,
      totalPnl: totalPnl._sum.pnlUsd || 0,
    };
  }
}
