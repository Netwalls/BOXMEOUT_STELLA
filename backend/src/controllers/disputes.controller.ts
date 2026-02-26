// Disputes Controller
import { Response } from 'express';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { DisputeService } from '../services/dispute.service.js';
import { logger } from '../utils/logger.js';
import { DisputeStatus } from '@prisma/client';

class DisputesController {
    private disputeService: DisputeService;

    constructor() {
        this.disputeService = new DisputeService();
    }

    /**
     * POST /api/disputes - Submit a new dispute
     */
    async submitDispute(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const { marketId, reason, evidenceUrl } = req.body;

            if (!marketId || !reason) {
                res.status(400).json({ error: 'Market ID and reason are required' });
                return;
            }

            const dispute = await this.disputeService.submitDispute({
                marketId,
                userId,
                reason,
                evidenceUrl,
            });

            res.status(201).json(dispute);
        } catch (error: any) {
            logger.error('Error submitting dispute', { error: error.message });
            res.status(error.message.includes('not found') ? 404 : 400).json({
                error: error.message,
            });
        }
    }

    /**
     * PATCH /api/disputes/:disputeId/review - Review a dispute (Admin only)
     */
    async reviewDispute(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { disputeId } = req.params;
            const { adminNotes } = req.body;

            if (!adminNotes) {
                res.status(400).json({ error: 'Admin notes are required' });
                return;
            }

            const dispute = await this.disputeService.reviewDispute(disputeId as string, adminNotes);
            res.status(200).json(dispute);
        } catch (error: any) {
            logger.error('Error reviewing dispute', { error: error.message });
            res.status(error.message.includes('not found') ? 404 : 400).json({
                error: error.message,
            });
        }
    }

    /**
     * PATCH /api/disputes/:disputeId/resolve - Resolve a dispute (Admin only)
     */
    async resolveDispute(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { disputeId } = req.params;
            const { action, resolution, adminNotes, newWinningOutcome } = req.body;

            if (!action || !['DISMISS', 'RESOLVE_NEW_OUTCOME'].includes(action)) {
                res.status(400).json({ error: 'Valid action (DISMISS or RESOLVE_NEW_OUTCOME) is required' });
                return;
            }

            if (!resolution) {
                res.status(400).json({ error: 'Resolution details are required' });
                return;
            }

            const dispute = await this.disputeService.resolveDispute(disputeId as string, action, {
                resolution,
                adminNotes,
                newWinningOutcome,
            });

            res.status(200).json(dispute);
        } catch (error: any) {
            logger.error('Error resolving dispute', { error: error.message });
            res.status(error.message.includes('not found') ? 404 : 400).json({
                error: error.message,
            });
        }
    }

    /**
     * GET /api/disputes/:disputeId - Get dispute details
     */
    async getDispute(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { disputeId } = req.params;
            const dispute = await this.disputeService.getDisputeDetails(disputeId as string);

            if (!dispute) {
                res.status(404).json({ error: 'Dispute not found' });
                return;
            }

            res.status(200).json(dispute);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }

    /**
     * GET /api/disputes - List disputes
     */
    async listDisputes(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const status = req.query.status as DisputeStatus | undefined;
            const disputes = await this.disputeService.listDisputes(status);
            res.status(200).json(disputes);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }
}

export const disputesController = new DisputesController();
