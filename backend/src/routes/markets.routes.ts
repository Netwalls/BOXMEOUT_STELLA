// backend/src/routes/markets.routes.ts
// Market routes - endpoint definitions

import { Router } from 'express';
import { marketsController } from '../controllers/markets.controller.js';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/admin.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import {
  createMarketBody,
  createPoolBody,
  uuidParam,
} from '../schemas/validation.schemas.js';

const router: Router = Router();

/**
 * @swagger
 * /api/markets:
 *   post:
 *     summary: Create new prediction market
 *     description: Create a new prediction market with two outcomes
 *     tags: [Markets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateMarketRequest'
 *     responses:
 *       201:
 *         description: Market created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Market'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.post(
  '/',
  requireAuth,
  validate({ body: createMarketBody }),
  (req, res) => marketsController.createMarket(req, res)
);

/**
 * @swagger
 * /api/markets:
 *   get:
 *     summary: List all markets
 *     description: Get paginated list of prediction markets with optional filters
 *     tags: [Markets]
 *     parameters:
 *       - $ref: '#/components/parameters/PaginationPage'
 *       - $ref: '#/components/parameters/PaginationLimit'
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [OPEN, CLOSED, RESOLVED, DISPUTED, CANCELLED]
 *       - name: category
 *         in: query
 *         schema:
 *           type: string
 *           enum: [WRESTLING, BOXING, MMA, SPORTS, POLITICAL, CRYPTO, ENTERTAINMENT]
 *       - name: sort
 *         in: query
 *         schema:
 *           type: string
 *           enum: [createdAt, closingAt, totalVolume, participantCount]
 *           default: createdAt
 *       - name: order
 *         in: query
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: Markets retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     markets:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Market'
 *                     pagination:
 *                       $ref: '#/components/schemas/PaginationMeta'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
router.get('/', optionalAuth, (req, res) =>
  marketsController.listMarkets(req, res)
);

/**
 * @swagger
 * /api/markets/{id}:
 *   get:
 *     summary: Get market details
 *     description: Get detailed information about a specific market
 *     tags: [Markets]
 *     parameters:
 *       - $ref: '#/components/parameters/MarketId'
 *     responses:
 *       200:
 *         description: Market details retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Market'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', optionalAuth, validate({ params: uuidParam }), (req, res) =>
  marketsController.getMarketDetails(req, res)
);

/**
 * @swagger
 * /api/markets/{id}/pool:
 *   post:
 *     summary: Create AMM liquidity pool
 *     description: Initialize an AMM pool for a market (admin only)
 *     tags: [Markets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/MarketId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - initialLiquidity
 *             properties:
 *               initialLiquidity:
 *                 type: number
 *                 minimum: 100
 *                 description: Initial liquidity in USDC
 *     responses:
 *       201:
 *         description: Pool created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     poolAddress:
 *                       type: string
 *                     txHash:
 *                       type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  '/:id/pool',
  requireAuth,
  validate({ params: uuidParam, body: createPoolBody }),
  (req, res) => marketsController.createPool(req, res)
);

/**
 * PATCH /api/markets/:id/deactivate - Deactivate a market
 * Requires authentication and admin privileges
 */
router.patch(
  '/:id/deactivate',
  requireAuth,
  requireAdmin,
  validate({ params: uuidParam }),
  (req, res) => marketsController.deactivateMarket(req, res)
);

export default router;
