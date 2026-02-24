// Shares routes - portfolio position endpoints
import { Router } from 'express';
import { sharesController } from '../controllers/shares.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Portfolio
 *   description: Portfolio position management and tracking
 */

/**
 * @swagger
 * /api/users/{userId}/positions:
 *   get:
 *     summary: Get all positions for a user
 *     description: Retrieves all active positions with current values based on AMM spot prices
 *     tags: [Portfolio]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *       - in: query
 *         name: marketId
 *         schema:
 *           type: string
 *         description: Filter by specific market
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *         description: Pagination offset
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *         description: Number of results to return
 *     responses:
 *       200:
 *         description: List of positions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Position'
 *                 count:
 *                   type: integer
 *       403:
 *         description: Unauthorized
 */
router.get(
  '/users/:userId/positions',
  authMiddleware,
  sharesController.getUserPositions
);

/**
 * @swagger
 * /api/users/{userId}/positions/{marketId}/{outcome}:
 *   get:
 *     summary: Get a specific position
 *     description: Retrieves a specific position with updated current value
 *     tags: [Portfolio]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: outcome
 *         required: true
 *         schema:
 *           type: integer
 *           enum: [0, 1]
 *     responses:
 *       200:
 *         description: Position details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Position'
 *       404:
 *         description: Position not found
 */
router.get(
  '/users/:userId/positions/:marketId/:outcome',
  authMiddleware,
  sharesController.getPosition
);

/**
 * @swagger
 * /api/users/{userId}/portfolio/summary:
 *   get:
 *     summary: Get portfolio summary
 *     description: Retrieves aggregated portfolio metrics including total PnL and return percentage
 *     tags: [Portfolio]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Portfolio summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/PortfolioSummary'
 */
router.get(
  '/users/:userId/portfolio/summary',
  authMiddleware,
  sharesController.getPortfolioSummary
);

/**
 * @swagger
 * /api/users/{userId}/portfolio/breakdown:
 *   get:
 *     summary: Get position breakdown by outcome
 *     description: Retrieves position statistics grouped by YES/NO outcomes
 *     tags: [Portfolio]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Position breakdown
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/PositionBreakdown'
 */
router.get(
  '/users/:userId/portfolio/breakdown',
  authMiddleware,
  sharesController.getPositionBreakdown
);

/**
 * @swagger
 * /api/users/{userId}/portfolio/refresh:
 *   post:
 *     summary: Refresh portfolio values
 *     description: Batch updates all share values based on current AMM spot prices
 *     tags: [Portfolio]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Portfolio refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     updated:
 *                       type: integer
 *                     total:
 *                       type: integer
 */
router.post(
  '/users/:userId/portfolio/refresh',
  authMiddleware,
  sharesController.refreshPortfolio
);

/**
 * @swagger
 * /api/markets/{marketId}/positions:
 *   get:
 *     summary: Get all positions for a market (Admin only)
 *     description: Retrieves all user positions for a specific market
 *     tags: [Portfolio]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of positions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Position'
 *                 count:
 *                   type: integer
 *       403:
 *         description: Admin access required
 */
router.get(
  '/markets/:marketId/positions',
  authMiddleware,
  sharesController.getMarketPositions
);

/**
 * @swagger
 * components:
 *   schemas:
 *     Position:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         userId:
 *           type: string
 *           format: uuid
 *         marketId:
 *           type: string
 *           format: uuid
 *         outcome:
 *           type: integer
 *           enum: [0, 1]
 *           description: 0 for NO, 1 for YES
 *         quantity:
 *           type: string
 *           description: Number of shares owned
 *         costBasis:
 *           type: string
 *           description: Total cost of acquisition
 *         entryPrice:
 *           type: string
 *           description: Average price per share
 *         currentValue:
 *           type: string
 *           description: Current market value
 *         unrealizedPnl:
 *           type: string
 *           description: Unrealized profit/loss
 *         acquiredAt:
 *           type: string
 *           format: date-time
 *         market:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             title:
 *               type: string
 *             category:
 *               type: string
 *             status:
 *               type: string
 *     PortfolioSummary:
 *       type: object
 *       properties:
 *         totalPositions:
 *           type: integer
 *         totalCostBasis:
 *           type: number
 *         totalCurrentValue:
 *           type: number
 *         totalUnrealizedPnl:
 *           type: number
 *         totalRealizedPnl:
 *           type: number
 *         totalPnl:
 *           type: number
 *         returnPercentage:
 *           type: number
 *     PositionBreakdown:
 *       type: object
 *       properties:
 *         yes:
 *           type: object
 *           properties:
 *             count:
 *               type: integer
 *             totalValue:
 *               type: number
 *             totalCostBasis:
 *               type: number
 *             totalUnrealizedPnl:
 *               type: number
 *         no:
 *           type: object
 *           properties:
 *             count:
 *               type: integer
 *             totalValue:
 *               type: number
 *             totalCostBasis:
 *               type: number
 *             totalUnrealizedPnl:
 *               type: number
 */

export default router;
