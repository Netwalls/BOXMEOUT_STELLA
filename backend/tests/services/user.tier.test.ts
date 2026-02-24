import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService } from '../../src/services/user.service.js';
import { UserTier } from '@prisma/client';

describe('User Tier Promotion Logic', () => {
  let userService: UserService;
  let mockUserRepository: any;
  let mockNotificationService: any;

  beforeEach(() => {
    mockUserRepository = {
      findById: vi.fn(),
      getUserStats: vi.fn(),
      updateTier: vi.fn(),
    };
    mockNotificationService = {
      createTierUpgradeNotification: vi.fn(),
    };

    userService = new UserService(mockUserRepository, mockNotificationService);
  });

  it('should promote user to ADVANCED when criteria met (50 predictions, 60% win rate)', async () => {
    const userId = 'user-1';
    mockUserRepository.findById.mockResolvedValue({
      id: userId,
      tier: UserTier.BEGINNER,
    });
    mockUserRepository.getUserStats.mockResolvedValue({
      predictionCount: 50,
      winRate: 60,
    });
    mockUserRepository.updateTier.mockResolvedValue({
      id: userId,
      tier: UserTier.ADVANCED,
    });

    const result = await userService.calculateAndUpdateTier(userId);

    expect(mockUserRepository.updateTier).toHaveBeenCalledWith(
      userId,
      UserTier.ADVANCED
    );
    expect(
      mockNotificationService.createTierUpgradeNotification
    ).toHaveBeenCalledWith(userId, UserTier.BEGINNER, UserTier.ADVANCED);
    expect(result.tier).toBe(UserTier.ADVANCED);
  });

  it('should promote user to EXPERT when criteria met (200 predictions, 65% win rate)', async () => {
    const userId = 'user-2';
    mockUserRepository.findById.mockResolvedValue({
      id: userId,
      tier: UserTier.ADVANCED,
    });
    mockUserRepository.getUserStats.mockResolvedValue({
      predictionCount: 200,
      winRate: 65,
    });
    mockUserRepository.updateTier.mockResolvedValue({
      id: userId,
      tier: UserTier.EXPERT,
    });

    const result = await userService.calculateAndUpdateTier(userId);

    expect(mockUserRepository.updateTier).toHaveBeenCalledWith(
      userId,
      UserTier.EXPERT
    );
    expect(
      mockNotificationService.createTierUpgradeNotification
    ).toHaveBeenCalledWith(userId, UserTier.ADVANCED, UserTier.EXPERT);
    expect(result.tier).toBe(UserTier.EXPERT);
  });

  it('should promote user to LEGENDARY when criteria met (500 predictions, 75% win rate)', async () => {
    const userId = 'user-3';
    mockUserRepository.findById.mockResolvedValue({
      id: userId,
      tier: UserTier.EXPERT,
    });
    mockUserRepository.getUserStats.mockResolvedValue({
      predictionCount: 500,
      winRate: 75,
    });
    mockUserRepository.updateTier.mockResolvedValue({
      id: userId,
      tier: UserTier.LEGENDARY,
    });

    const result = await userService.calculateAndUpdateTier(userId);

    expect(mockUserRepository.updateTier).toHaveBeenCalledWith(
      userId,
      UserTier.LEGENDARY
    );
    expect(
      mockNotificationService.createTierUpgradeNotification
    ).toHaveBeenCalledWith(userId, UserTier.EXPERT, UserTier.LEGENDARY);
    expect(result.tier).toBe(UserTier.LEGENDARY);
  });

  it('should not update tier if criteria for next tier not met', async () => {
    const userId = 'user-4';
    mockUserRepository.findById.mockResolvedValue({
      id: userId,
      tier: UserTier.BEGINNER,
    });
    mockUserRepository.getUserStats.mockResolvedValue({
      predictionCount: 49,
      winRate: 100,
    });

    const result = await userService.calculateAndUpdateTier(userId);

    expect(mockUserRepository.updateTier).not.toHaveBeenCalled();
    expect(
      mockNotificationService.createTierUpgradeNotification
    ).not.toHaveBeenCalled();
    expect(result.tier).toBe(UserTier.BEGINNER);
  });

  it('should not update tier if win rate too low', async () => {
    const userId = 'user-5';
    mockUserRepository.findById.mockResolvedValue({
      id: userId,
      tier: UserTier.BEGINNER,
    });
    mockUserRepository.getUserStats.mockResolvedValue({
      predictionCount: 100,
      winRate: 59,
    });

    const result = await userService.calculateAndUpdateTier(userId);

    expect(mockUserRepository.updateTier).not.toHaveBeenCalled();
    expect(result.tier).toBe(UserTier.BEGINNER);
  });

  it('should not trigger notification if tier remains the same', async () => {
    const userId = 'user-6';
    mockUserRepository.findById.mockResolvedValue({
      id: userId,
      tier: UserTier.ADVANCED,
    });
    mockUserRepository.getUserStats.mockResolvedValue({
      predictionCount: 60,
      winRate: 62,
    });

    const result = await userService.calculateAndUpdateTier(userId);

    expect(mockUserRepository.updateTier).not.toHaveBeenCalled();
    expect(
      mockNotificationService.createTierUpgradeNotification
    ).not.toHaveBeenCalled();
    expect(result.tier).toBe(UserTier.ADVANCED);
  });
});
