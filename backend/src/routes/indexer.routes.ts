// backend/src/routes/indexer.routes.ts
// Indexer routes - blockchain event indexer management

import { Router, Request, Response } from 'express';
import { indexerController } from '../controllers/indexer.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/admin.middleware.js';

const router: Router = Router();

/**
 * GET /api/indexer/status - Get Indexer Status
 * Requires admin authentication
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     state: {
 *       lastProcessedLedger: number,
 *       isRunning: boolean,
 *       lastError?: string,
 *       eventsProcessed: number
 *     },
 *     latestLedger: number,
 *     ledgersBehind: number
 *   }
 * }
 */
router.get(
  '/status',
  requireAuth,
  requireAdmin,
  (req: Request, res: Response) => indexerController.getStatus(req, res)
);

/**
 * POST /api/indexer/start - Start Indexer
 * Requires admin authentication
 *
 * Response:
 * {
 *   success: true,
 *   message: "Indexer started successfully"
 * }
 */
router.post(
  '/start',
  requireAuth,
  requireAdmin,
  (req: Request, res: Response) => indexerController.start(req, res)
);

/**
 * POST /api/indexer/stop - Stop Indexer
 * Requires admin authentication
 *
 * Response:
 * {
 *   success: true,
 *   message: "Indexer stopped successfully"
 * }
 */
router.post('/stop', requireAuth, requireAdmin, (req: Request, res: Response) =>
  indexerController.stop(req, res)
);

/**
 * POST /api/indexer/reprocess - Reprocess Events from Ledger
 * Requires admin authentication
 *
 * Request Body:
 * {
 *   startLedger: number
 * }
 *
 * Response:
 * {
 *   success: true,
 *   message: "Reprocessing from ledger {startLedger}"
 * }
 */
router.post(
  '/reprocess',
  requireAuth,
  requireAdmin,
  (req: Request, res: Response) => indexerController.reprocess(req, res)
);

export default router;
