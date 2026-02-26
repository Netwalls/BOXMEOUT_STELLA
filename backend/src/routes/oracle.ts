// backend/src/routes/oracle.ts
// Oracle and Resolution routes

import { Router } from 'express';
import { oracleController } from '../controllers/oracle.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { uuidParam, attestBody } from '../schemas/validation.schemas.js';

const router: Router = Router();

/**
 * @swagger
 * /api/markets/{id}/attest:
 *   post:
 *     summary: Submit oracle attestation
 *     description: Submit an oracle attestation for market resolution
 *     tags: [Oracle]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
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
 *               - outcome
 *               - source
 *             properties:
 *               outcome:
 *                 type: integer
 *                 enum: [0, 1]
 *                 description: 0 for outcomeA, 1 for outcomeB
 *               source:
 *                 type: string
 *                 description: Source of the attestation
 *     responses:
 *       200:
 *         description: Attestation submitted successfully
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
 *                     txHash:
 *                       type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  '/:id/attest',
  requireAuth,
  validate({ params: uuidParam, body: attestBody }),
  (req, res) => oracleController.attestMarket(req, res)
);

/**
 * @swagger
 * /api/markets/{id}/resolve:
 *   post:
 *     summary: Resolve market
 *     description: Trigger market resolution based on oracle attestations
 *     tags: [Oracle]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
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
 *             $ref: '#/components/schemas/ResolveMarketRequest'
 *     responses:
 *       200:
 *         description: Market resolved successfully
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
 *                     marketId:
 *                       type: string
 *                       format: uuid
 *                     winningOutcome:
 *                       type: integer
 *                       enum: [0, 1]
 *                     txHash:
 *                       type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  '/:id/resolve',
  requireAuth,
  validate({ params: uuidParam }),
  (req, res) => oracleController.resolveMarket(req, res)
);

/**
 * @swagger
 * /api/markets/{id}/claim:
 *   post:
 *     summary: Claim winnings
 *     description: Claim winnings from a resolved market
 *     tags: [Oracle]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Winnings claimed successfully
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
 *                     amount:
 *                       type: number
 *                       description: Amount claimed in USDC
 *                     txHash:
 *                       type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  '/:id/claim',
  requireAuth,
  validate({ params: uuidParam }),
  (req, res) => oracleController.claimWinnings(req, res)
);

export default router;
