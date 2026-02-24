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
