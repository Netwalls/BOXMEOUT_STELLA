/**
 * @swagger
 * tags:
 *   name: Trading
 *   description: Bet placement and trading actions
 */

/**
 * @swagger
 * /trading/bet:
 *   post:
 *     summary: Place a bet on a market
 *     tags: [Trading]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [marketId, outcome, amount, walletAddress]
 *             properties:
 *               marketId:
 *                 type: string
 *               outcome:
 *                 type: integer
 *                 enum: [0, 1]
 *               amount:
 *                 type: number
 *                 minimum: 0.01
 *               walletAddress:
 *                 type: string
 *     responses:
 *       200:
 *         description: Bet placed successfully
 *       400:
 *         description: Validation error or market not open
 *       401:
 *         description: Unauthorized
 */
import { Router } from 'express';

const router = Router();

router.post('/bet', (_req, res) => res.json({ ok: true }));

export default router;
