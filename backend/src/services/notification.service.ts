// Notification service - business logic for notifications
import { NotificationRepository } from '../repositories/notification.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { NotificationType, UserTier } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { Server as SocketIOServer } from 'socket.io';

export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: any;
}

export class NotificationService {
  private notificationRepository: NotificationRepository;
  private userRepository: UserRepository;
  private io?: SocketIOServer;

  constructor(
    notificationRepository?: NotificationRepository,
    userRepository?: UserRepository
  ) {
    this.notificationRepository =
      notificationRepository || new NotificationRepository();
    this.userRepository = userRepository || new UserRepository();
  }

  /**
   * Set Socket.IO instance for real-time notifications
   */
  setSocketIO(io: SocketIOServer): void {
    this.io = io;
    logger.info('Socket.IO instance attached to NotificationService');
  }

  /**
   * Create and send a notification
   */
  async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    metadata?: any
  ) {
    try {
      // Check user preferences
      const user = await this.userRepository.findById(userId);
      if (!user) {
        logger.warn('User not found for notification', { userId });
        return null;
      }

      // Check if user wants this type of notification
      if (!this.shouldNotifyUser(user, type)) {
        logger.debug('User has disabled this notification type', {
          userId,
          type,
        });
        return null;
      }

      // Create notification in database
      const notification = await this.notificationRepository.createNotification(
        {
          userId,
          type,
          title,
          message,
          metadata,
        }
      );

      // Send real-time notification via WebSocket
      await this.sendRealtimeNotification(userId, notification);

      // Send email notification if enabled
      if (user.emailNotifications) {
        await this.sendEmailNotification(user.email, notification);
      }

      return notification;
    } catch (error) {
      logger.error('Failed to create notification', { userId, type, error });
      // Don't throw - notifications are secondary to main business flows
      return null;
    }
  }

  /**
   * Check if user wants to receive this notification type
   */
  private shouldNotifyUser(user: any, type: NotificationType): boolean {
    switch (type) {
      case NotificationType.PREDICTION_RESULT:
        return user.notifyPredictionResult ?? true;
      case NotificationType.MARKET_RESOLVED:
        return user.notifyMarketResolution ?? true;
      case NotificationType.WINNINGS_AVAILABLE:
        return user.notifyWinnings ?? true;
      case NotificationType.ACHIEVEMENT:
      case NotificationType.TIER_UPGRADE:
        return user.notifyAchievements ?? true;
      case NotificationType.SYSTEM:
        return true; // Always send system notifications
      default:
        return true;
    }
  }

  /**
   * Send real-time notification via WebSocket
   */
  private async sendRealtimeNotification(
    userId: string,
    notification: any
  ): Promise<void> {
    if (!this.io) {
      logger.debug(
        'Socket.IO not initialized, skipping real-time notification'
      );
      return;
    }

    try {
      // Emit to user's personal room
      this.io.to(`user:${userId}`).emit('notification', {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        metadata: notification.metadata,
        isRead: notification.isRead,
        createdAt: notification.createdAt,
      });

      logger.debug('Real-time notification sent', {
        userId,
        notificationId: notification.id,
        type: notification.type,
      });
    } catch (error) {
      logger.error('Failed to send real-time notification', {
        userId,
        error,
      });
    }
  }

  /**
   * Send email notification (placeholder for email service integration)
   */
  private async sendEmailNotification(
    email: string,
    notification: any
  ): Promise<void> {
    try {
      // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
      logger.info('Email notification queued', {
        email,
        type: notification.type,
        title: notification.title,
      });

      // Placeholder for actual email sending
      // await emailService.send({
      //   to: email,
      //   subject: notification.title,
      //   template: getEmailTemplate(notification.type),
      //   data: {
      //     title: notification.title,
      //     message: notification.message,
      //     metadata: notification.metadata,
      //   },
      // });
    } catch (error) {
      logger.error('Failed to send email notification', { email, error });
    }
  }

  /**
   * Notify user about prediction result
   */
  async notifyPredictionResult(
    userId: string,
    marketTitle: string,
    isWinner: boolean,
    pnl: number
  ) {
    const title = isWinner ? '🎉 Prediction Won!' : '😔 Prediction Lost';
    const message = isWinner
      ? `Your prediction on "${marketTitle}" was correct! You earned $${pnl.toFixed(2)}.`
      : `Your prediction on "${marketTitle}" was incorrect. Better luck next time!`;

    return await this.createNotification(
      userId,
      NotificationType.PREDICTION_RESULT,
      title,
      message,
      { marketTitle, isWinner, pnl }
    );
  }

  /**
   * Notify user about market resolution
   */
  async notifyMarketResolution(
    userId: string,
    marketTitle: string,
    winningOutcome: string
  ) {
    const title = '✅ Market Resolved';
    const message = `The market "${marketTitle}" has been resolved. Winning outcome: ${winningOutcome}`;

    return await this.createNotification(
      userId,
      NotificationType.MARKET_RESOLVED,
      title,
      message,
      { marketTitle, winningOutcome }
    );
  }

  /**
   * Notify user about available winnings
   */
  async notifyWinningsAvailable(
    userId: string,
    marketTitle: string,
    amount: number
  ) {
    const title = '💰 Winnings Available!';
    const message = `You have $${amount.toFixed(2)} in winnings available from "${marketTitle}". Claim them now!`;

    return await this.createNotification(
      userId,
      NotificationType.WINNINGS_AVAILABLE,
      title,
      message,
      { marketTitle, amount }
    );
  }

  /**
   * Notify user about achievement earned
   */
  async notifyAchievementEarned(
    userId: string,
    achievementName: string,
    description: string,
    tier: string
  ) {
    const title = '🏆 Achievement Unlocked!';
    const message = `You've earned the "${achievementName}" achievement (${tier})! ${description}`;

    return await this.createNotification(
      userId,
      NotificationType.ACHIEVEMENT,
      title,
      message,
      { achievementName, description, tier }
    );
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

  /**
   * Update user notification preferences
   */
  async updateNotificationPreferences(
    userId: string,
    preferences: {
      notifyPredictionResult?: boolean;
      notifyMarketResolution?: boolean;
      notifyWinnings?: boolean;
      notifyAchievements?: boolean;
      emailNotifications?: boolean;
    }
  ) {
    try {
      const user = await this.userRepository.update(userId, preferences);
      logger.info('Notification preferences updated', { userId, preferences });
      return user;
    } catch (error) {
      logger.error('Failed to update notification preferences', {
        userId,
        error,
      });
      throw error;
    }
  }
}

export const notificationService = new NotificationService();
