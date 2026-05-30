// backend/src/controllers/users.controller.ts - User Controller
import { Response } from 'express';
import { UserService } from '../services/user.service.js';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { UserTier } from '@prisma/client';
import { logger } from '../utils/logger.js';

const userService = new UserService();

export class UsersController {
  /**
   * GET /api/users/:id — public; returns public profile
   */
  async getProfile(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const profile = await userService.getPublicProfile(id);
      return res.status(200).json({ success: true, data: profile });
    } catch (error: any) {
      if (error.message === 'User not found') {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      logger.error('UsersController.getProfile error', { error });
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * PATCH /api/users/me — requires auth; updates username and/or avatarUrl (issue #36)
   */
  async updateMyProfile(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const updated = await userService.updateProfile(userId, req.body);
      return res.status(200).json({ success: true, data: updated });
    } catch (error: any) {
      if (error.message === 'Username already taken') {
        return res.status(409).json({
          success: false,
          error: { code: 'USERNAME_TAKEN', message: 'Username is already in use' },
        });
      }
      logger.error('UsersController.updateMyProfile error', { error });
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * GET /api/users/me — requires auth; returns full profile
   */
  async getMyProfile(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const profile = await userService.getMyProfile(userId);
      return res.status(200).json({ success: true, data: profile });
    } catch (error: any) {
      if (error.message === 'User not found') {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      logger.error('UsersController.getMyProfile error', { error });
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * GET /api/users — admin only; paginated user list with filters
   */
  async listUsers(req: AuthenticatedRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const role = req.query.role as UserTier | undefined;
      const status = req.query.status as 'active' | 'suspended' | undefined;
      const search = req.query.search as string | undefined;

      if (role && !Object.values(UserTier).includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid role' });
      }
      if (status && !['active', 'suspended'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }

      const result = await userService.listUsers({ page, limit, role, status, search });
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      logger.error('UsersController.listUsers error', { error });
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * PATCH /api/users/:id/suspend — admin only; suspends user and invalidates sessions
   */
  async suspendUser(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      await userService.suspendUser(id);
      return res.status(200).json({ success: true, message: 'User suspended' });
    } catch (error: any) {
      if (error.message === 'User not found') {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      logger.error('UsersController.suspendUser error', { error });
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * PATCH /api/users/:id/role — admin only; updates user role
   */
  async updateRole(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!role || !Object.values(UserTier).includes(role)) {
        return res.status(400).json({
          success: false,
          message: `Invalid role. Valid values: ${Object.values(UserTier).join(', ')}`,
        });
      }

      const user = await userService.updateUserRole(id, role as UserTier);
      return res.status(200).json({ success: true, data: { id: user.id, tier: user.tier } });
    } catch (error: any) {
      if (error.message === 'User not found') {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      logger.error('UsersController.updateRole error', { error });
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
}

export const usersController = new UsersController();
