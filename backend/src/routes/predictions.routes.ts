/**
 * @swagger
 * tags:
 *   name: Predictions
 *   description: User prediction history and open positions
 */

/**
 * @swagger
 * /predictions:
 *   get:
 *     summary: Get the authenticated user's predictions
 *     tags: [Predictions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, won, lost, refunded]
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of predictions
 *       401:
 *         description: Unauthorized
 */
import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => res.json({ predictions: [], pagination: { page: 1, limit: 20, total: 0 } }));

export default router;
