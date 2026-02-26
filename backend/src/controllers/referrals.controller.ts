import { Request, Response } from 'express';
import { referralService } from '../services/referral.service.js';
import { logger } from '../utils/logger.js';

export class ReferralsController {
  async getInfo(req: Request, res: Response): Promise<void> {
    try {
      // req.user is attached by requireAuth middleware
      // @ts-expect-error req.user is attached by requireAuth middleware
      const userId = req.user?.userId as string;
      if (!userId) {
        res
          .status(401)
          .json({ success: false, error: { message: 'Not authenticated' } });
        return;
      }

      const info = await referralService.getReferralInfo(userId);
      res.status(200).json({ success: true, data: info });
    } catch (error) {
      (req.log || logger).error('Get referral info error', { error });
      res
        .status(500)
        .json({ success: false, error: { message: (error as Error).message } });
    }
  }

  async claim(req: Request, res: Response): Promise<void> {
    try {
      const { referralCode } = req.body;
      if (!referralCode) {
        res.status(400).json({
          success: false,
          error: { message: 'referralCode required' },
        });
        return;
      }

      // @ts-expect-error req.user is attached by requireAuth middleware
      const referredUserId = req.user?.userId as string;
      if (!referredUserId) {
        res
          .status(401)
          .json({ success: false, error: { message: 'Not authenticated' } });
        return;
      }

      const result = await referralService.claimReferral(
        referralCode,
        referredUserId
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      (req.log || logger).error('Claim referral error', { error });
      res
        .status(400)
        .json({ success: false, error: { message: (error as Error).message } });
    }
  }
}

export const referralsController = new ReferralsController();
