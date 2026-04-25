// backend/src/routes/bets.routes.ts
// Bets routes - endpoint definitions

import { Router } from 'express';
import { betsController } from '../controllers/bets.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { bettorAddressParam } from '../schemas/validation.schemas.js';

const router: Router = Router();

/**
 * GET /api/bets/:bettor_address
 *
 * Returns all bets placed by the given Stellar public key.
 * - 200 + Bet[]  on success (empty array when address has no bets)
 * - 400          when bettor_address is not a valid Stellar G-key
 */
router.get(
  '/:bettor_address',
  validate({ params: bettorAddressParam }),
  (req, res) => betsController.getBetsByAddress(req, res)
);

export default router;
