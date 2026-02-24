import { Response } from 'express';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { TreasuryService } from '../services/treasury.service.js';
import { logger } from '../utils/logger.js';

export class TreasuryController {
  private treasuryService: TreasuryService;

  constructor() {
    this.treasuryService = new TreasuryService();
  }

  async getBalances(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const balances = await this.treasuryService.getBalances();

      res.json({
        success: true,
        data: balances,
      });
    } catch (error) {
      (req.log || logger).error('Get balances error', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'TREASURY_ERROR',
          message:
            error instanceof Error ? error.message : 'Failed to fetch balances',
        },
      });
    }
  }

  async distributeLeaderboard(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
        return;
      }

      // req.body is already validated by middleware
      const result = await this.treasuryService.distributeLeaderboard(
        req.body.recipients,
        req.user.userId
      );

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      (req.log || logger).error('Distribute leaderboard error', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'DISTRIBUTION_ERROR',
          message:
            error instanceof Error ? error.message : 'Distribution failed',
        },
      });
    }
  }

  async distributeCreator(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
        return;
      }

      // req.body is already validated by middleware
      const { marketId, creatorAddress, amount } = req.body;

      const result = await this.treasuryService.distributeCreator(
        marketId,
        creatorAddress,
        amount,
        req.user.userId
      );

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      (req.log || logger).error('Distribute creator error', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'DISTRIBUTION_ERROR',
          message:
            error instanceof Error ? error.message : 'Distribution failed',
        },
      });
    }
  }
}

export const treasuryController = new TreasuryController();
