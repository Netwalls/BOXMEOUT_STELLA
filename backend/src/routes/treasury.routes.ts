import { Router } from 'express';
import { treasuryController } from '../controllers/treasury.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/admin.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import {
  distributeLeaderboardBody,
  distributeCreatorBody,
} from '../schemas/validation.schemas.js';

const router: Router = Router();

/**
 * @swagger
 * /api/treasury/balances:
 *   get:
 *     summary: Get treasury balances
 *     description: Get current balances of all treasury accounts
 *     tags: [Treasury]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Balances retrieved successfully
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
 *                     platform:
 *                       type: number
 *                       description: Platform treasury balance in USDC
 *                     leaderboard:
 *                       type: number
 *                       description: Leaderboard pool balance in USDC
 *                     creator:
 *                       type: number
 *                       description: Creator rewards balance in USDC
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/balances', requireAuth, (req, res) =>
  treasuryController.getBalances(req, res)
);

router.post(
  '/distribute-leaderboard',
  requireAuth,
  requireAdmin,
  validate({ body: distributeLeaderboardBody }),
  (req, res) => treasuryController.distributeLeaderboard(req, res)
);

router.post(
  '/distribute-creator',
  requireAuth,
  requireAdmin,
  validate({ body: distributeCreatorBody }),
  (req, res) => treasuryController.distributeCreator(req, res)
);

export default router;
