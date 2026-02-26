import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import notificationsRoutes from '../notifications.routes.js';
import { notificationService } from '../../services/notification.service.js';

// Mock the notification service
vi.mock('../../services/notification.service.js', () => ({
  notificationService: {
    getUserNotifications: vi.fn(),
    getUnreadCount: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    updateNotificationPreferences: vi.fn(),
  },
}));

// Mock the auth middleware
vi.mock('../../middleware/auth.middleware.js', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.user = { userId: 'test-user-123', publicKey: 'test-key' };
    next();
  },
}));

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock user repository
vi.mock('../../repositories/user.repository.js', () => ({
  UserRepository: vi.fn().mockImplementation(() => ({
    findById: vi.fn().mockResolvedValue({
      id: 'test-user-123',
      notifyPredictionResult: true,
      notifyMarketResolution: true,
      notifyWinnings: true,
      notifyAchievements: true,
      emailNotifications: false,
    }),
  })),
}));

describe('Notifications Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/notifications', notificationsRoutes);
  });

  describe('GET /api/notifications', () => {
    it('should return user notifications', async () => {
      const mockNotifications = [
        {
          id: '1',
          userId: 'test-user-123',
          type: 'PREDICTION_RESULT',
          title: 'Test',
          message: 'Test message',
          isRead: false,
          createdAt: new Date(),
        },
      ];

      vi.mocked(notificationService.getUserNotifications).mockResolvedValue(
        mockNotifications as any
      );

      const response = await request(app).get('/api/notifications');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockNotifications);
      expect(notificationService.getUserNotifications).toHaveBeenCalledWith(
        'test-user-123',
        20
      );
    });

    it('should accept custom limit parameter', async () => {
      vi.mocked(notificationService.getUserNotifications).mockResolvedValue(
        [] as any
      );

      await request(app).get('/api/notifications?limit=50');

      expect(notificationService.getUserNotifications).toHaveBeenCalledWith(
        'test-user-123',
        50
      );
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(notificationService.getUserNotifications).mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app).get('/api/notifications');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to retrieve notifications');
    });
  });

  describe('GET /api/notifications/unread-count', () => {
    it('should return unread notification count', async () => {
      vi.mocked(notificationService.getUnreadCount).mockResolvedValue(5);

      const response = await request(app).get(
        '/api/notifications/unread-count'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.count).toBe(5);
      expect(notificationService.getUnreadCount).toHaveBeenCalledWith(
        'test-user-123'
      );
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(notificationService.getUnreadCount).mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app).get(
        '/api/notifications/unread-count'
      );

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/notifications/preferences', () => {
    it('should return notification preferences', async () => {
      const response = await request(app).get('/api/notifications/preferences');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        notifyPredictionResult: true,
        notifyMarketResolution: true,
        notifyWinnings: true,
        notifyAchievements: true,
        emailNotifications: false,
      });
    });
  });

  describe('PUT /api/notifications/preferences', () => {
    it('should update notification preferences', async () => {
      const preferences = {
        notifyPredictionResult: false,
        notifyWinnings: true,
        emailNotifications: true,
      };

      const updatedUser = {
        id: 'test-user-123',
        notifyPredictionResult: false,
        notifyMarketResolution: true,
        notifyWinnings: true,
        notifyAchievements: true,
        emailNotifications: true,
      };

      vi.mocked(
        notificationService.updateNotificationPreferences
      ).mockResolvedValue(updatedUser as any);

      const response = await request(app)
        .put('/api/notifications/preferences')
        .send(preferences);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.emailNotifications).toBe(true);
      expect(
        notificationService.updateNotificationPreferences
      ).toHaveBeenCalledWith('test-user-123', preferences);
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(
        notificationService.updateNotificationPreferences
      ).mockRejectedValue(new Error('Update failed'));

      const response = await request(app)
        .put('/api/notifications/preferences')
        .send({});

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/notifications/:notificationId/read', () => {
    it('should mark notification as read', async () => {
      const mockNotifications = [
        {
          id: 'notif-123',
          userId: 'test-user-123',
          isRead: false,
        },
      ];

      vi.mocked(notificationService.getUserNotifications).mockResolvedValue(
        mockNotifications as any
      );
      vi.mocked(notificationService.markRead).mockResolvedValue({
        id: 'notif-123',
        isRead: true,
      } as any);

      const response = await request(app).put(
        '/api/notifications/notif-123/read'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(notificationService.markRead).toHaveBeenCalledWith('notif-123');
    });

    it('should return 404 for non-existent notification', async () => {
      vi.mocked(notificationService.getUserNotifications).mockResolvedValue(
        [] as any
      );

      const response = await request(app).put(
        '/api/notifications/notif-999/read'
      );

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Notification not found');
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(notificationService.getUserNotifications).mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app).put(
        '/api/notifications/notif-123/read'
      );

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/notifications/read-all', () => {
    it('should mark all notifications as read', async () => {
      vi.mocked(notificationService.markAllRead).mockResolvedValue(10);

      const response = await request(app).put('/api/notifications/read-all');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.markedCount).toBe(10);
      expect(notificationService.markAllRead).toHaveBeenCalledWith(
        'test-user-123'
      );
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(notificationService.markAllRead).mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app).put('/api/notifications/read-all');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });
});
