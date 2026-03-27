// Notification repository - data access layer for notifications
import { Notification, NotificationType } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

export class NotificationRepository extends BaseRepository<Notification> {
  getModelName(): string {
    return 'notification';
  }

  async createNotification(data: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: any;
  }): Promise<Notification> {
    return this.timedQuery('createNotification', () =>
      this.prisma.notification.create({ data })
    );
  }

  async findByUserId(
    userId: string,
    limit: number = 20
  ): Promise<Notification[]> {
    return this.timedQuery('findByUserId', () =>
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
    );
  }

  async markAsRead(notificationId: string): Promise<Notification> {
    return this.timedQuery('markAsRead', () =>
      this.prisma.notification.update({
        where: { id: notificationId },
        data: { isRead: true },
      })
    );
  }

  async markAllAsRead(userId: string): Promise<number> {
    return this.timedQuery('markAllAsRead', async () => {
      const result = await this.prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
      });
      return result.count;
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.timedQuery('getUnreadCount', () =>
      this.prisma.notification.count({ where: { userId, isRead: false } })
    );
  }
}
