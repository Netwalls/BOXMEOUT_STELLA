import { Response } from 'express';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { TreasuryService } from '../services/treasury.service.js';
import { logger } from '../utils/logger.js';
import { z } from 'zod';

const distributeLeaderboardSchema = z.object({
  recipients: z
    .array(
      z.object({
        address: z.string().min(56).max(56),
        amount: z.string().regex(/^\d+$/),
      })
    )
    .min(1),
});

const distributeCreatorSchema = z.object({
  marketId: z.string(),
  creatorAddress: z.string().min(56).max(56),
  amount: z.string().regex(/^\d+$/),
});

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

      const validation = distributeLeaderboardSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: validation.error.errors,
          },
        });
        return;
      }

      const result = await this.treasuryService.distributeLeaderboard(
        validation.data.recipients,
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

      const validation = distributeCreatorSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: validation.error.errors,
          },
        });
        return;
      }

      const { marketId, creatorAddress, amount } = validation.data;

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
