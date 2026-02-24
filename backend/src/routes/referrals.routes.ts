import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { referralsController } from '../controllers/referrals.controller.js';

const router = Router();

// GET /api/referrals - get referral code and stats for authenticated user
router.get('/', requireAuth, (req, res) =>
  referralsController.getInfo(req, res)
);

// POST /api/referrals/claim - claim signup via referral code
router.post('/claim', requireAuth, (req, res) =>
  referralsController.claim(req, res)
);

export default router;
