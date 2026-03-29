// backend/src/routes/users.routes.ts - User Routes
import { Router, Response, NextFunction } from 'express';
import { usersController } from '../controllers/users.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/admin.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { updateProfileBody } from '../schemas/validation.schemas.js';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { UserRepository } from '../repositories/user.repository.js';

const router = Router();
const userRepository = new UserRepository();

/**
 * Middleware: reject suspended users on any authenticated request (issue #37)
 */
async function rejectSuspended(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) return next();
  const user = await userRepository.findById(req.user.userId);
  if (user && !user.isActive) {
    res.status(403).json({
      success: false,
      error: { code: 'ACCOUNT_SUSPENDED', message: 'Your account has been suspended' },
    });
    return;
  }
  next();
}

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     summary: Get authenticated user's full profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Full user profile
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Account suspended
 */
router.get('/me', requireAuth, rejectSuspended, usersController.getMyProfile.bind(usersController));

/**
 * @swagger
 * /api/users/me:
 *   patch:
 *     summary: Update authenticated user's profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 30
 *                 pattern: '^[a-zA-Z0-9_]+$'
 *               avatarUrl:
 *                 type: string
 *                 format: uri
 *     responses:
 *       200:
 *         description: Updated user profile
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Username already in use
 */
router.patch('/me', requireAuth, rejectSuspended, validate({ body: updateProfileBody }), usersController.updateMyProfile.bind(usersController));

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: List all users (admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [BEGINNER, ADVANCED, EXPERT, LEGENDARY]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, suspended]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Paginated user list
 *       403:
 *         description: Admin access required
 */
router.get('/', requireAuth, requireAdmin, usersController.listUsers.bind(usersController));

/**
 * @swagger
 * /api/users/{id}/suspend:
 *   patch:
 *     summary: Suspend a user account (admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User suspended
 *       404:
 *         description: User not found
 *       403:
 *         description: Admin access required
 */
router.patch('/:id/suspend', requireAuth, requireAdmin, usersController.suspendUser.bind(usersController));

/**
 * @swagger
 * /api/users/{id}/role:
 *   patch:
 *     summary: Update user role (admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [BEGINNER, ADVANCED, EXPERT, LEGENDARY]
 *     responses:
 *       200:
 *         description: Role updated
 *       400:
 *         description: Invalid role
 *       404:
 *         description: User not found
 */
router.patch('/:id/role', requireAuth, requireAdmin, usersController.updateRole.bind(usersController));

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get public user profile
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Public user profile
 *       404:
 *         description: User not found
 */
router.get('/:id', usersController.getProfile.bind(usersController));

export default router;
