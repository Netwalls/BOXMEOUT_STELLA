/**
 * @swagger
 * tags:
 *   name: Bets
 *   description: Bet placement, claims, and history
 */

/**
 * @swagger
 * /claims:
 *   post:
 *     summary: Claim winnings for a resolved market
 *     tags: [Bets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [marketId, bettorAddress]
 *             properties:
 *               marketId:
 *                 type: string
 *               bettorAddress:
 *                 type: string
 *     responses:
 *       200:
 *         description: Winnings claimed
 *       400:
 *         description: Invalid request
 *
 * /claims/refund:
 *   post:
 *     summary: Claim a refund for a cancelled market
 *     tags: [Bets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [marketId, bettorAddress]
 *             properties:
 *               marketId:
 *                 type: string
 *               bettorAddress:
 *                 type: string
 *     responses:
 *       200:
 *         description: Refund processed
 *       400:
 *         description: Invalid request
 *
 * /bets/{bettor_address}:
 *   get:
 *     summary: Get all bets for a bettor address
 *     tags: [Bets]
 *     parameters:
 *       - in: path
 *         name: bettor_address
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of bets
 *
 * /bets/{bettor_address}/stats:
 *   get:
 *     summary: Get betting statistics for a bettor address
 *     tags: [Bets]
 *     parameters:
 *       - in: path
 *         name: bettor_address
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Bettor statistics
 */
import { Router } from 'express';
import { claimWinnings, claimRefund, getBetsByAddress, getBettorStats } from '../api/controllers/BetController';

const router = Router();

// Claim endpoints (mounted at /api/claims)
router.post('/', claimWinnings);
router.post('/refund', claimRefund);

// Bet listing endpoints (also accessible via /api/bets when mounted there)
router.get('/:bettor_address/stats', getBettorStats);
router.get('/:bettor_address', getBetsByAddress);

export default router;
