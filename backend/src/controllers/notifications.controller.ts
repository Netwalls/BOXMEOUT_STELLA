import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { notificationService } from '../services/notification.service.js';
import { logger } from '../utils/logger.js';

/**
 * Get user notifications
 */
export async function getUserNotifications(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const userId = req.user!.userId;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    const notifications = await notificationService.getUserNotifications(
      userId,
      limit
    );

    res.json({
      success: true,
      data: notifications,
    });
  } catch (error) {
    logger.error('Failed to get user notifications', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve notifications',
    });
  }
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.userId;

    const count = await notificationService.getUnreadCount(userId);

    res.json({
      success: true,
      data: { count },
    });
  } catch (error) {
    logger.error('Failed to get unread count', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve unread count',
    });
  }
}

/**
 * Mark notification as read
 */
export async function markNotificationRead(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const notificationId = req.params.notificationId as string;
    const userId = req.user!.userId;

    // Verify notification belongs to user
    const notifications = await notificationService.getUserNotifications(
      userId,
      1000
    );
    const notification = notifications.find((n) => n.id === notificationId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found',
      });
    }

    const updated = await notificationService.markRead(notificationId);

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    logger.error('Failed to mark notification as read', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read',
    });
  }
}

/**
 * Mark all notifications as read
 */
export async function markAllNotificationsRead(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const userId = req.user!.userId;

    const count = await notificationService.markAllRead(userId);

    res.json({
      success: true,
      data: { markedCount: count },
    });
  } catch (error) {
    logger.error('Failed to mark all notifications as read', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to mark all notifications as read',
    });
  }
}

/**
 * Update notification preferences
 */
export async function updateNotificationPreferences(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const userId = req.user!.userId;
    const {
      notifyPredictionResult,
      notifyMarketResolution,
      notifyWinnings,
      notifyAchievements,
      emailNotifications,
    } = req.body;

    const user = await notificationService.updateNotificationPreferences(
      userId,
      {
        notifyPredictionResult,
        notifyMarketResolution,
        notifyWinnings,
        notifyAchievements,
        emailNotifications,
      }
    );

    res.json({
      success: true,
      data: {
        notifyPredictionResult: user.notifyPredictionResult,
        notifyMarketResolution: user.notifyMarketResolution,
        notifyWinnings: user.notifyWinnings,
        notifyAchievements: user.notifyAchievements,
        emailNotifications: user.emailNotifications,
      },
    });
  } catch (error) {
    logger.error('Failed to update notification preferences', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to update notification preferences',
    });
  }
}

/**
 * Get notification preferences
 */
export async function getNotificationPreferences(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const userId = req.user!.userId;

    // Get user from repository
    const { UserRepository } =
      await import('../repositories/user.repository.js');
    const userRepository = new UserRepository();
    const user = await userRepository.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      data: {
        notifyPredictionResult: user.notifyPredictionResult,
        notifyMarketResolution: user.notifyMarketResolution,
        notifyWinnings: user.notifyWinnings,
        notifyAchievements: user.notifyAchievements,
        emailNotifications: user.emailNotifications,
      },
    });
  } catch (error) {
    logger.error('Failed to get notification preferences', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve notification preferences',
    });
  }
}
