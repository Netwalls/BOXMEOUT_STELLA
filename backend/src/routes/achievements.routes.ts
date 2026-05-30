/**
 * @swagger
 * tags:
 *   name: Achievements
 *   description: User achievements and badges
 */

/**
 * @swagger
 * /achievements:
 *   get:
 *     summary: Get all available achievements
 *     tags: [Achievements]
 *     responses:
 *       200:
 *         description: List of all achievements
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string }
 *                   name: { type: string }
 *                   description: { type: string }
 *                   iconUrl: { type: string }
 *
 * /achievements/me:
 *   get:
 *     summary: Get the authenticated user's earned achievements
 *     tags: [Achievements]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of earned achievements with earned date
 *       401:
 *         description: Unauthorized
 */
import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => res.json([]));
router.get('/me', (_req, res) => res.json([]));

export default router;
