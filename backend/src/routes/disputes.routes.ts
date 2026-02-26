// Disputes routes
import { Router } from 'express';
import { disputesController } from '../controllers/disputes.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/admin.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
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
 *               reason:
 *                 type: string
 *               evidenceUrl:
 *                 type: string
 *     responses:
 *       201:
 *         description: Dispute submitted
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post(
    '/',
    requireAuth,
    validate({ body: submitDisputeBody }),
    (req, res) => disputesController.submitDispute(req, res)
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
router.get(
    '/',
    (req, res) => disputesController.listDisputes(req, res)
);

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
 *     responses:
 *       200:
 *         description: Dispute details
 *       404:
 *         description: Dispute not found
 */
router.get(
    '/:disputeId',
    (req, res) => disputesController.getDispute(req, res)
);

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
 *     responses:
 *       200:
 *         description: Dispute updated to REVIEWING
 *       403:
 *         description: Forbidden
 */
router.patch(
    '/:disputeId/review',
    requireAuth,
    requireAdmin,
    validate({ body: reviewDisputeBody }),
    (req, res) => disputesController.reviewDispute(req, res)
);

/**
 * @swagger
 * /api/disputes/{disputeId}/resolve:
 *   patch:
 *     summary: Resolve a dispute (Admin only)
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: disputeId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
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
 *               adminNotes:
 *                 type: string
 *               newWinningOutcome:
 *                 type: number
 *     responses:
 *       200:
 *         description: Dispute resolved
 *       403:
 *         description: Forbidden
 */
router.patch(
    '/:disputeId/resolve',
    requireAuth,
    requireAdmin,
    validate({ body: resolveDisputeBody }),
    (req, res) => disputesController.resolveDispute(req, res)
);

export default router;
