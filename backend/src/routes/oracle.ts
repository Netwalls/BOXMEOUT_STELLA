// backend/src/routes/oracle.ts
// Oracle and Resolution routes

import { Router } from 'express';
import { oracleController } from '../controllers/oracle.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

/**
 * POST /api/markets/:id/attest - Submit oracle attestation
 */
router.post('/:id/attest', requireAuth, (req, res) =>
  oracleController.attestMarket(req, res)
);

/**
 * POST /api/markets/:id/resolve - Trigger market resolution
 */
router.post('/:id/resolve', requireAuth, (req, res) =>
  oracleController.resolveMarket(req, res)
);

/**
 * POST /api/markets/:id/claim - Claim winnings for a resolved market
 */
router.post('/:id/claim', requireAuth, (req, res) =>
  oracleController.claimWinnings(req, res)
);

export default router;
