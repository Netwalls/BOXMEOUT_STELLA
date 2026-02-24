// backend/src/routes/oracle.ts
// Oracle and Resolution routes

import { Router } from 'express';
import { oracleController } from '../controllers/oracle.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { uuidParam, attestBody } from '../schemas/validation.schemas.js';

const router: Router = Router();

/**
 * POST /api/markets/:id/attest - Submit oracle attestation
 */
router.post(
  '/:id/attest',
  requireAuth,
  validate({ params: uuidParam, body: attestBody }),
  (req, res) => oracleController.attestMarket(req, res)
);

/**
 * POST /api/markets/:id/resolve - Trigger market resolution
 */
router.post(
  '/:id/resolve',
  requireAuth,
  validate({ params: uuidParam }),
  (req, res) => oracleController.resolveMarket(req, res)
);

/**
 * POST /api/markets/:id/claim - Claim winnings for a resolved market
 */
router.post(
  '/:id/claim',
  requireAuth,
  validate({ params: uuidParam }),
  (req, res) => oracleController.claimWinnings(req, res)
);

export default router;
