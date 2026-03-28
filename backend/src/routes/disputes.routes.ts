// Disputes routes
import { Router, Request, Response, NextFunction } from 'express';
import { disputesController } from '../controllers/disputes.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/admin.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { AuthenticatedRequest } from '../types/auth.types.js';
import {
  submitDisputeBody,
  reviewDisputeBody,
  resolveDisputeBody,
} from '../schemas/validation.schemas.js';

const router: Router = Router();

/**
 * @swagger
 * tags:
 *   name: Disputes
 *   description: Market dispute management
 */

/**
 * @swagger
 * /api/disputes:
 *   post:
 *     summary: Submit a new dispute
 *     description: User challenges an oracle report by submitting a dispute
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - marketId
 *               - reason
 *             properties:
 *               marketId:
 *                 type: string
 *                 format: uuid
 *               reason:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 1000
 *               evidenceUrl:
 *                 type: string
 *                 format: url
 *     responses:
 *       201:
 *         description: Dispute submitted successfully
 *       400:
 *         description: Bad request or invalid market status
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Dispute already exists for this market
 */
router.post(
  '/',
  requireAuth,
  validate({ body: submitDisputeBody }),
  (req: Request, res: Response, next: NextFunction) => {
    disputesController.submitDispute(req as AuthenticatedRequest, res).catch(next);
  }
);

/**
 * @swagger
 * /api/disputes:
 *   get:
 *     summary: List all disputes
 *     tags: [Disputes]
 *     parameters:
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [OPEN, REVIEWING, RESOLVED, DISMISSED]
 *     responses:
 *       200:
 *         description: List of disputes
 */
router.get('/', (req: Request, res: Response, next: NextFunction) => {
  disputesController.listDisputes(req as AuthenticatedRequest, res).catch(next);
});

/**
 * @swagger
 * /api/disputes/{disputeId}:
 *   get:
 *     summary: Get dispute details
 *     tags: [Disputes]
 *     parameters:
 *       - name: disputeId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Dispute details
 *       404:
 *         description: Dispute not found
 */
router.get('/:disputeId', (req: Request, res: Response, next: NextFunction) => {
  disputesController.getDispute(req as AuthenticatedRequest, res).catch(next);
});

/**
 * @swagger
 * /api/disputes/{disputeId}/review:
 *   patch:
 *     summary: Review a dispute (Admin only)
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: disputeId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - adminNotes
 *             properties:
 *               adminNotes:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 5000
 *     responses:
 *       200:
 *         description: Dispute updated to REVIEWING
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Dispute not found
 */
router.patch(
  '/:disputeId/review',
  requireAuth,
  requireAdmin,
  validate({ body: reviewDisputeBody }),
  (req: Request, res: Response, next: NextFunction) => {
    disputesController.reviewDispute(req as AuthenticatedRequest, res).catch(next);
  }
);

/**
 * @swagger
 * /api/disputes/{disputeId}/resolve:
 *   patch:
 *     summary: Resolve a dispute (Admin only)
 *     description: Admin rules on an active dispute - upholding it refunds the bond; rejecting it slashes it
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: disputeId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *               - resolution
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [DISMISS, RESOLVE_NEW_OUTCOME]
 *               resolution:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 5000
 *               adminNotes:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 5000
 *               newWinningOutcome:
 *                 type: integer
 *                 enum: [0, 1]
 *     responses:
 *       200:
 *         description: Dispute resolved successfully
 *       400:
 *         description: Invalid action or missing required fields
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Dispute or market not found
 */
router.patch(
  '/:disputeId/resolve',
  requireAuth,
  requireAdmin,
  validate({ body: resolveDisputeBody }),
  (req: Request, res: Response, next: NextFunction) => {
    disputesController.resolveDispute(req as AuthenticatedRequest, res).catch(next);
  }
);

export default router;
