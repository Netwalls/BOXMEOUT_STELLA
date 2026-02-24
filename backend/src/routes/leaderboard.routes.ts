// Leaderboard Routes - handles mapping endpoints to controllers
import { Router } from 'express';
import { leaderboardController } from '../controllers/leaderboard.controller.js';

const router = Router();

/**
 * @swagger
 * /api/leaderboard/global:
 *   get:
 *     summary: Get global leaderboard
 *     tags: [Leaderboard]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Global leaderboard data
 */
router.get('/global', leaderboardController.getGlobal);

/**
 * @swagger
 * /api/leaderboard/weekly:
 *   get:
 *     summary: Get weekly leaderboard
 *     tags: [Leaderboard]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Weekly leaderboard data
 */
router.get('/weekly', leaderboardController.getWeekly);

/**
 * @swagger
 * /api/leaderboard/category/{category}:
 *   get:
 *     summary: Get leaderboard by category
 *     tags: [Leaderboard]
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Category leaderboard data
 */
router.get('/category/:category', leaderboardController.getByCategory);

export default router;
