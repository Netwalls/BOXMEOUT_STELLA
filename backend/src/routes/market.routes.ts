/**
 * @swagger
 * tags:
 *   name: Markets
 *   description: Prediction market endpoints
 */

/**
 * @swagger
 * /markets:
 *   get:
 *     summary: List markets (paginated)
 *     tags: [Markets]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [OPEN, LOCKED, RESOLVED, CANCELLED]
 *     responses:
 *       200:
 *         description: Paginated list of markets
 *
 * /markets/{market_id}:
 *   get:
 *     summary: Get a single market
 *     tags: [Markets]
 *     parameters:
 *       - in: path
 *         name: market_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Market details
 *       404:
 *         description: Market not found
 *
 * /markets/{market_id}/bets:
 *   get:
 *     summary: List bets for a market
 *     tags: [Markets]
 *     parameters:
 *       - in: path
 *         name: market_id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of bets
 *
 * /markets/{market_id}/odds:
 *   get:
 *     summary: Get current odds for a market
 *     tags: [Markets]
 *     parameters:
 *       - in: path
 *         name: market_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Current odds
 *
 * /markets/{market_id}/stats:
 *   get:
 *     summary: Get market statistics
 *     tags: [Markets]
 *     parameters:
 *       - in: path
 *         name: market_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Market stats
 *
 * /markets/{market_id}/simulate:
 *   get:
 *     summary: Simulate payout for a given bet amount and outcome
 *     tags: [Markets]
 *     parameters:
 *       - in: path
 *         name: market_id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: amount
 *         required: true
 *         schema: { type: number }
 *       - in: query
 *         name: outcome
 *         required: true
 *         schema: { type: integer, enum: [0, 1] }
 *     responses:
 *       200:
 *         description: Simulated payout
 *
 * /markets/{market_id}/resolve:
 *   post:
 *     summary: Resolve a market (admin only)
 *     tags: [Markets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: market_id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [winningOutcome]
 *             properties:
 *               winningOutcome:
 *                 type: integer
 *                 enum: [0, 1]
 *     responses:
 *       200:
 *         description: Market resolved
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Market not found
 */
import { Router } from 'express';
import {
    listMarkets,
    listMarketsValidation,
    getMarket,
    getMarketBets,
    getMarketBetsValidation,
    getMarketOdds,
    getMarketStats,
    getPlatformStats,
    resolveMarket,
    simulatePayout,
    simulatePayoutValidation,
} from '../api/controllers/MarketController';
import { requireAdminJwt } from '../middleware/requireAdminJwt.middleware';

const router = Router();

// Issue #18 — GET /api/markets (paginated list)
router.get('/', listMarketsValidation, listMarkets);

router.get('/:market_id', getMarket);
router.get('/:market_id/bets', getMarketBetsValidation, getMarketBets);
router.get('/:market_id/odds', getMarketOdds);
router.get('/:market_id/stats', getMarketStats);
router.get('/:market_id/simulate', simulatePayoutValidation, simulatePayout);

// Issue #745 — POST /api/markets/:market_id/resolve (admin)
router.post('/:market_id/resolve', requireAdminJwt, resolveMarket);

export default router;
