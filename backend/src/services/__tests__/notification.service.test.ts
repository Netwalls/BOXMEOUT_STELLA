import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationService } from '../notification.service.js';
import { NotificationRepository } from '../../repositories/notification.repository.js';
import { UserRepository } from '../../repositories/user.repository.js';
import { NotificationType, UserTier } from '@prisma/client';

// Mock repositories
vi.mock('../../repositories/notification.repository.js');
vi.mock('../../repositories/user.repository.js');
vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockNotificationRepository: any;
  let mockUserRepository: any;
  let mockIo: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock repositories
    mockNotificationRepository = {
      createNotification: vi.fn(),
      findByUserId: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      getUnreadCount: vi.fn(),
    };

    mockUserRepository = {
      findById: vi.fn(),
      update: vi.fn(),
    };

    // Create mock Socket.IO
    mockIo = {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
    };

    // Create service instance
    notificationService = new NotificationService(
      mockNotificationRepository,
      mockUserRepository
    );
  });

  describe('createNotification', () => {
    it('should create notification when user preferences allow it', async () => {
      const userId = 'user-123';
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        notifyPredictionResult: true,
        emailNotifications: false,
      };

      const mockNotification = {
        id: 'notif-123',
        userId,
        type: NotificationType.PREDICTION_RESULT,
        title: 'Test',
        message: 'Test message',
        isRead: false,
        createdAt: new Date(),
      };

      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockNotificationRepository.createNotification.mockResolvedValue(
        mockNotification
      );

      const result = await notificationService.createNotification(
        userId,
        NotificationType.PREDICTION_RESULT,
        'Test',
        'Test message'
      );

      expect(result).toEqual(mockNotification);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(userId);
      expect(mockNotificationRepository.createNotification).toHaveBeenCalled();
    });

    it('should not create notification when user has disabled it', async () => {
      const userId = 'user-123';
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        notifyPredictionResult: false,
        emailNotifications: false,
      };

      mockUserRepository.findById.mockResolvedValue(mockUser);

      const result = await notificationService.createNotification(
        userId,
        NotificationType.PREDICTION_RESULT,
        'Test',
        'Test message'
      );

      expect(result).toBeNull();
      expect(
        mockNotificationRepository.createNotification
      ).not.toHaveBeenCalled();
    });

    it('should send real-time notification when Socket.IO is available', async () => {
      const userId = 'user-123';
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        notifyPredictionResult: true,
        emailNotifications: false,
      };

      const mockNotification = {
        id: 'notif-123',
        userId,
        type: NotificationType.PREDICTION_RESULT,
        title: 'Test',
        message: 'Test message',
        isRead: false,
        createdAt: new Date(),
      };

      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockNotificationRepository.createNotification.mockResolvedValue(
        mockNotification
      );

      notificationService.setSocketIO(mockIo);

      await notificationService.createNotification(
        userId,
        NotificationType.PREDICTION_RESULT,
        'Test',
        'Test message'
      );

      expect(mockIo.to).toHaveBeenCalledWith(`user:${userId}`);
      expect(mockIo.emit).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          id: mockNotification.id,
          type: mockNotification.type,
          title: mockNotification.title,
          message: mockNotification.message,
        })
      );
    });

    it('should return null when user not found', async () => {
      const userId = 'user-123';
      mockUserRepository.findById.mockResolvedValue(null);

      const result = await notificationService.createNotification(
        userId,
        NotificationType.PREDICTION_RESULT,
        'Test',
        'Test message'
      );

      expect(result).toBeNull();
      expect(
        mockNotificationRepository.createNotification
      ).not.toHaveBeenCalled();
    });
  });

  describe('notifyPredictionResult', () => {
    it('should create winning notification with correct format', async () => {
      const userId = 'user-123';
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        notifyPredictionResult: true,
        emailNotifications: false,
      };

      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockNotificationRepository.createNotification.mockResolvedValue({});

      await notificationService.notifyPredictionResult(
        userId,
        'Test Market',
        true,
        100.5
      );

      expect(
        mockNotificationRepository.createNotification
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: NotificationType.PREDICTION_RESULT,
          title: '🎉 Prediction Won!',
          message: expect.stringContaining('Test Market'),
          metadata: expect.objectContaining({
            marketTitle: 'Test Market',
            isWinner: true,
            pnl: 100.5,
          }),
        })
      );
    });

    it('should create losing notification with correct format', async () => {
      const userId = 'user-123';
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        notifyPredictionResult: true,
        emailNotifications: false,
      };

      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockNotificationRepository.createNotification.mockResolvedValue({});

      await notificationService.notifyPredictionResult(
        userId,
        'Test Market',
        false,
        -50.25
      );

      expect(
        mockNotificationRepository.createNotification
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: NotificationType.PREDICTION_RESULT,
          title: '😔 Prediction Lost',
          message: expect.stringContaining('incorrect'),
          metadata: expect.objectContaining({
            isWinner: false,
            pnl: -50.25,
          }),
        })
      );
    });
  });

  describe('notifyMarketResolution', () => {
    it('should create market resolution notification', async () => {
      const userId = 'user-123';
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        notifyMarketResolution: true,
        emailNotifications: false,
      };

      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockNotificationRepository.createNotification.mockResolvedValue({});

      await notificationService.notifyMarketResolution(
        userId,
        'Test Market',
        'Outcome A'
      );

      expect(
        mockNotificationRepository.createNotification
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: NotificationType.MARKET_RESOLVED,
          title: '✅ Market Resolved',
          message: expect.stringContaining('Outcome A'),
          metadata: expect.objectContaining({
            marketTitle: 'Test Market',
            winningOutcome: 'Outcome A',
          }),
        })
      );
    });
  });

  describe('notifyWinningsAvailable', () => {
    it('should create winnings available notification', async () => {
      const userId = 'user-123';
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        notifyWinnings: true,
        emailNotifications: false,
      };

      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockNotificationRepository.createNotification.mockResolvedValue({});

      await notificationService.notifyWinningsAvailable(
        userId,
        'Test Market',
        250.75
      );

      expect(
        mockNotificationRepository.createNotification
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: NotificationType.WINNINGS_AVAILABLE,
          title: '💰 Winnings Available!',
          message: expect.stringContaining('$250.75'),
          metadata: expect.objectContaining({
            marketTitle: 'Test Market',
            amount: 250.75,
          }),
        })
      );
    });
  });

  describe('notifyAchievementEarned', () => {
    it('should create achievement notification', async () => {
      const userId = 'user-123';
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        notifyAchievements: true,
        emailNotifications: false,
      };

      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockNotificationRepository.createNotification.mockResolvedValue({});

      await notificationService.notifyAchievementEarned(
        userId,
        'First Win',
        'Won your first prediction',
        'BRONZE'
      );

      expect(
        mockNotificationRepository.createNotification
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: NotificationType.ACHIEVEMENT,
          title: '🏆 Achievement Unlocked!',
          message: expect.stringContaining('First Win'),
          metadata: expect.objectContaining({
            achievementName: 'First Win',
            tier: 'BRONZE',
          }),
        })
      );
    });
  });

  describe('updateNotificationPreferences', () => {
    it('should update user notification preferences', async () => {
      const userId = 'user-123';
      const preferences = {
        notifyPredictionResult: false,
        notifyWinnings: true,
        emailNotifications: true,
      };

      const updatedUser = {
        id: userId,
        ...preferences,
      };

      mockUserRepository.update.mockResolvedValue(updatedUser);

      const result = await notificationService.updateNotificationPreferences(
        userId,
        preferences
      );

      expect(mockUserRepository.update).toHaveBeenCalledWith(
        userId,
        preferences
      );
      expect(result).toEqual(updatedUser);
    });
  });

  describe('getUserNotifications', () => {
    it('should retrieve user notifications', async () => {
      const userId = 'user-123';
      const mockNotifications = [
        { id: '1', userId, title: 'Test 1' },
        { id: '2', userId, title: 'Test 2' },
      ];

      mockNotificationRepository.findByUserId.mockResolvedValue(
        mockNotifications
      );

      const result = await notificationService.getUserNotifications(userId, 20);

      expect(mockNotificationRepository.findByUserId).toHaveBeenCalledWith(
        userId,
        20
      );
      expect(result).toEqual(mockNotifications);
    });
  });

  describe('markRead', () => {
    it('should mark notification as read', async () => {
      const notificationId = 'notif-123';
      const mockNotification = { id: notificationId, isRead: true };

      mockNotificationRepository.markAsRead.mockResolvedValue(mockNotification);

      const result = await notificationService.markRead(notificationId);

      expect(mockNotificationRepository.markAsRead).toHaveBeenCalledWith(
        notificationId
      );
      expect(result).toEqual(mockNotification);
    });
  });

  describe('markAllRead', () => {
    it('should mark all notifications as read', async () => {
      const userId = 'user-123';
      mockNotificationRepository.markAllAsRead.mockResolvedValue(5);

      const result = await notificationService.markAllRead(userId);

      expect(mockNotificationRepository.markAllAsRead).toHaveBeenCalledWith(
        userId
      );
      expect(result).toBe(5);
    });
  });

  describe('getUnreadCount', () => {
    it('should get unread notification count', async () => {
      const userId = 'user-123';
      mockNotificationRepository.getUnreadCount.mockResolvedValue(3);

      const result = await notificationService.getUnreadCount(userId);

      expect(mockNotificationRepository.getUnreadCount).toHaveBeenCalledWith(
        userId
      );
      expect(result).toBe(3);
    });
  });
});
