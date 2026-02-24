// Notification service - business logic for notifications
import { NotificationRepository } from '../repositories/notification.repository.js';
import { NotificationType, UserTier } from '@prisma/client';
import { logger } from '../utils/logger.js';

export class NotificationService {
  private notificationRepository: NotificationRepository;

  constructor(notificationRepository?: NotificationRepository) {
    this.notificationRepository =
      notificationRepository || new NotificationRepository();
  }

  async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    metadata?: any
  ) {
    try {
      return await this.notificationRepository.createNotification({
        userId,
        type,
        title,
        message,
        metadata,
      });
    } catch (error) {
      logger.error('Failed to create notification', { userId, type, error });
      // Don't throw - notifications are secondary to main business flows
      return null;
    }
  }

  async createTierUpgradeNotification(
    userId: string,
    oldTier: UserTier,
    newTier: UserTier
  ) {
    const title = 'Tier Upgraded! 🚀';
    const message = `Congratulations! You've been promoted from ${oldTier} to ${newTier} tier based on your performance.`;

    return await this.createNotification(
      userId,
      NotificationType.TIER_UPGRADE,
      title,
      message,
      { oldTier, newTier }
    );
  }

  async getUserNotifications(userId: string, limit?: number) {
    return await this.notificationRepository.findByUserId(userId, limit);
  }

  async markRead(notificationId: string) {
    return await this.notificationRepository.markAsRead(notificationId);
  }

  async markAllRead(userId: string) {
    return await this.notificationRepository.markAllAsRead(userId);
  }

  async getUnreadCount(userId: string) {
    return await this.notificationRepository.getUnreadCount(userId);
  }
}

export const notificationService = new NotificationService();
