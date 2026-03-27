// backend/src/controllers/indexer.controller.ts
// Indexer controller - handles indexer management HTTP requests

import { Request, Response } from 'express';
import { indexerService } from '../services/blockchain/indexer.js';
import { logger } from '../utils/logger.js';

export class IndexerController {
  /**
   * GET /api/indexer/status - Get indexer status
   */
  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const statistics = await indexerService.getStatistics();

      res.status(200).json({
        success: true,
        data: statistics,
      });
    } catch (error) {
      logger.error('Failed to get indexer status', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get indexer status',
        },
      });
    }
  }

  /**
   * POST /api/indexer/start - Start the indexer
   */
  async start(req: Request, res: Response): Promise<void> {
    try {
      await indexerService.start();

      res.status(200).json({
        success: true,
        message: 'Indexer started successfully',
      });
    } catch (error) {
      logger.error('Failed to start indexer', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to start indexer',
        },
      });
    }
  }

  /**
   * POST /api/indexer/stop - Stop the indexer
   */
  async stop(req: Request, res: Response): Promise<void> {
    try {
      await indexerService.stop();

      res.status(200).json({
        success: true,
        message: 'Indexer stopped successfully',
      });
    } catch (error) {
      logger.error('Failed to stop indexer', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to stop indexer',
        },
      });
    }
  }

  /**
   * POST /api/indexer/reprocess - Reprocess from a specific ledger
   */
  async reprocess(req: Request, res: Response): Promise<void> {
    try {
      const { startLedger } = req.body;

      if (!startLedger || typeof startLedger !== 'number') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'startLedger must be a number',
          },
        });
        return;
      }

      await indexerService.reprocessFromLedger(startLedger);

      res.status(200).json({
        success: true,
        message: `Reprocessing from ledger ${startLedger}`,
      });
    } catch (error) {
      logger.error('Failed to reprocess events', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to reprocess events',
        },
      });
    }
  }
}

export const indexerController = new IndexerController();
