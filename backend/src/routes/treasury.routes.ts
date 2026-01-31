import { Router } from 'express';
import { treasuryController } from '../controllers/treasury.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/admin.middleware.js';

const router: Router = Router();

router.get('/balances', requireAuth, (req, res) =>
  treasuryController.getBalances(req, res)
);

router.post('/distribute-leaderboard', requireAuth, requireAdmin, (req, res) =>
  treasuryController.distributeLeaderboard(req, res)
);

router.post('/distribute-creator', requireAuth, requireAdmin, (req, res) =>
  treasuryController.distributeCreator(req, res)
);

export default router;
