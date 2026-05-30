/**
 * @swagger
 * tags:
 *   name: Leaderboard
 *   description: Platform leaderboard rankings
 */

/**
 * @swagger
 * /leaderboard:
 *   get:
 *     summary: Get the global leaderboard
 *     tags: [Leaderboard]
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [all-time, monthly, weekly]
 *           default: all-time
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Ranked list of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 entries:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       rank: { type: integer }
 *                       userId: { type: string }
 *                       username: { type: string }
 *                       totalWinnings: { type: number }
 *                       winRate: { type: number }
 *                 pagination:
 *                   type: object
 */
import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => res.json({ entries: [], pagination: { page: 1, limit: 50, total: 0 } }));

export default router;
