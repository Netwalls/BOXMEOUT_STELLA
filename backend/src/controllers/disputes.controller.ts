// Disputes Controller
import { Response } from 'express';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { DisputeService } from '../services/dispute.service.js';
import { ApiError } from '../middleware/error.middleware.js';
import { logger } from '../utils/logger.js';
import { DisputeStatus } from '@prisma/client';

class DisputesController {
  private disputeService: DisputeService;

  constructor() {
    this.disputeService = new DisputeService();
  }

  /**
   * POST /api/disputes - Submit a new dispute
   * 
   * Issue #366: User challenges an oracle report by posting a bond and proposing an alternative outcome.
   * 
   * Acceptance Criteria:
   * - Requires auth
   * - Body: { marketId, proposedOutcomeId, reason }
   * - Validates market is in reported state and dispute window is active
   * - Checks no existing dispute for this market (409 if one already exists)
   * - Deducts bond from user wallet via wallet.service.ts
   * - Calls Stellar contract dispute_outcome
   * - Saves dispute record via dispute.service.ts and dispute.repository.ts
   * - Returns 201 with dispute record
   */
  async submitDispute(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.userId;
    if (!userId) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    const { marketId, reason, evidenceUrl } = req.body;

    if (!marketId || !reason) {
      throw new ApiError(
        400,
        'MISSING_FIELDS',
        'Market ID and reason are required'
      );
    }

    logger.info('Submitting dispute', { userId, marketId });

    const dispute = await this.disputeService.submitDispute({
      marketId,
      userId,
      reason,
      evidenceUrl,
    });

    res.status(201).json({ success: true, data: dispute });
  }

  /**
   * PATCH /api/disputes/:disputeId/review - Review a dispute (Admin only)
   */
  async reviewDispute(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { disputeId } = req.params;
    const { adminNotes } = req.body;

    if (!adminNotes) {
      throw new ApiError(400, 'MISSING_NOTES', 'Admin notes are required');
    }

    logger.info('Reviewing dispute', { disputeId, adminNotes });

    const dispute = await this.disputeService.reviewDispute(
      disputeId as string,
      adminNotes
    );

    res.status(200).json({ success: true, data: dispute });
  }

  /**
   * PATCH /api/disputes/:disputeId/resolve - Resolve a dispute (Admin only)
   * 
   * Issue #367: Admin rules on an active dispute — upholding it refunds the bond; rejecting it slashes it.
   * 
   * Acceptance Criteria:
   * - Admin only
   * - Body: { upheld: boolean, finalOutcomeId?: number }
   * - Calls Stellar contract resolve_dispute
   * - If upheld: refunds bond to disputer via wallet.service.ts
   * - If rejected: sends bond to treasury
   * - Updates dispute status in DB
   * - Sends notification to disputer
   * - Integration test: upheld → bond refunded; rejected → bond slashed
   */
  async resolveDispute(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    const { disputeId } = req.params;
    const { action, resolution, adminNotes, newWinningOutcome } = req.body;

    if (!action || !['DISMISS', 'RESOLVE_NEW_OUTCOME'].includes(action)) {
      throw new ApiError(
        400,
        'INVALID_ACTION',
        'Valid action (DISMISS or RESOLVE_NEW_OUTCOME) is required'
      );
    }

    if (!resolution) {
      throw new ApiError(
        400,
        'MISSING_RESOLUTION',
        'Resolution details are required'
      );
    }

    logger.info('Resolving dispute', { disputeId, action });

    const dispute = await this.disputeService.resolveDispute(
      disputeId as string,
      action,
      {
        resolution,
        adminNotes,
        newWinningOutcome,
      }
    );

    res.status(200).json({ success: true, data: dispute });
  }

  /**
   * GET /api/disputes/:disputeId - Get dispute details
   */
  async getDispute(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { disputeId } = req.params;
    const dispute = await this.disputeService.getDisputeDetails(
      disputeId as string
    );

    if (!dispute) {
      throw new ApiError(404, 'NOT_FOUND', 'Dispute not found');
    }

    res.status(200).json({ success: true, data: dispute });
  }

  /**
   * GET /api/disputes - List disputes
   */
  async listDisputes(req: AuthenticatedRequest, res: Response): Promise<void> {
    const status = req.query.status as DisputeStatus | undefined;
    const disputes = await this.disputeService.listDisputes(status);
    res.status(200).json({ success: true, data: disputes });
  }
}

export const disputesController = new DisputesController();
