/**
 * @swagger
 * tags:
 *   name: Oracle
 *   description: Oracle result submission and transparency reports
 */

/**
 * @swagger
 * /oracle/submit:
 *   post:
 *     summary: Submit a match result (oracle only)
 *     tags: [Oracle]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [matchId, winningOutcome]
 *             properties:
 *               matchId:
 *                 type: string
 *               winningOutcome:
 *                 type: integer
 *                 enum: [0, 1]
 *               signature:
 *                 type: string
 *     responses:
 *       200:
 *         description: Result submitted
 *       401:
 *         description: Invalid API key
 *       400:
 *         description: Validation error
 *
 * /oracle/reports/{match_id}:
 *   get:
 *     summary: Get oracle reports for a match (public transparency)
 *     tags: [Oracle]
 *     parameters:
 *       - in: path
 *         name: match_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Oracle reports for the match
 *       404:
 *         description: No reports found
 */
import { Router } from 'express';
import {
  submitOracleResult,
  validateSubmitOracleResult,
  getOracleReports,
} from '../api/controllers/OracleController';

const router = Router();

// POST /api/oracle/submit
router.post('/submit', validateSubmitOracleResult, submitOracleResult);

// GET /api/oracle/reports/:match_id — public transparency endpoint
router.get('/reports/:match_id', getOracleReports);

export default router;
