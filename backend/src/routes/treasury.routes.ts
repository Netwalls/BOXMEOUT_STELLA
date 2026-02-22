import { Router } from 'express';
import { treasuryController } from '../controllers/treasury.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/admin.middleware.js';
import { validate, schemas } from '../middleware/validation.middleware.js';

const router = Router();

router.get('/balances', requireAuth, (req, res) =>
  treasuryController.getBalances(req, res)
);

router.post(
  '/distribute-leaderboard',
  requireAuth,
  requireAdmin,
  validate({ body: schemas.distributeLeaderboard }),
  (req, res) => treasuryController.distributeLeaderboard(req, res)
);

router.post(
  '/distribute-creator',
  requireAuth,
  requireAdmin,
  validate({ body: schemas.distributeCreator }),
  (req, res) => treasuryController.distributeCreator(req, res)
);

export default router;
