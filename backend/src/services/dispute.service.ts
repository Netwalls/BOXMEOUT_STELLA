// Dispute service - business logic for dispute management
import { DisputeRepository } from '../repositories/dispute.repository.js';
import { MarketRepository } from '../repositories/market.repository.js';
import { DisputeStatus, MarketStatus } from '@prisma/client';
import { ApiError } from '../middleware/error.middleware.js';
import { logger } from '../utils/logger.js';

export class DisputeService {
  private disputeRepository: DisputeRepository;
  private marketRepository: MarketRepository;

  constructor(disputeRepo?: DisputeRepository, marketRepo?: MarketRepository) {
    this.disputeRepository = disputeRepo || new DisputeRepository();
    this.marketRepository = marketRepo || new MarketRepository();
  }

  /**
   * Submit a new dispute for a market
   * 
   * Validates:
   * - Market exists
   * - Market is in RESOLVED or CLOSED state
   * - No existing active dispute for this market
   */
  async submitDispute(data: {
    marketId: string;
    userId: string;
    reason: string;
    evidenceUrl?: string;
  }) {
    // Validate market exists
    const market = await this.marketRepository.findById(data.marketId);
    if (!market) {
      throw new ApiError(404, 'MARKET_NOT_FOUND', 'Market not found');
    }

    // Only RESOLVED or CLOSED markets can be disputed
    if (
      market.status !== MarketStatus.RESOLVED &&
      market.status !== MarketStatus.CLOSED
    ) {
      throw new ApiError(
        400,
        'INVALID_MARKET_STATUS',
        `Market in ${market.status} status cannot be disputed`
      );
    }

    // Check for existing active dispute
    const existingDisputes = await this.disputeRepository.findByMarketId(
      data.marketId
    );
    const activeDispute = existingDisputes.find(
      (d) => d.status !== DisputeStatus.DISMISSED && d.status !== DisputeStatus.RESOLVED
    );

    if (activeDispute) {
      throw new ApiError(
        409,
        'DISPUTE_EXISTS',
        'An active dispute already exists for this market'
      );
    }

    logger.info('Creating new dispute', {
      marketId: data.marketId,
      userId: data.userId,
    });

    // Create dispute record
    const dispute = await this.disputeRepository.create({
      marketId: data.marketId,
      userId: data.userId,
      reason: data.reason,
      evidenceUrl: data.evidenceUrl,
      status: DisputeStatus.OPEN,
    });

    // Update market status to DISPUTED to pause further actions
    await this.marketRepository.updateMarketStatus(
      data.marketId,
      MarketStatus.DISPUTED
    );

    return dispute;
  }

  /**
   * Review a dispute (admin only - should be enforced in controller/middleware)
   */
  async reviewDispute(disputeId: string, adminNotes: string) {
    const dispute = await this.disputeRepository.findById(disputeId);
    if (!dispute) {
      throw new ApiError(404, 'DISPUTE_NOT_FOUND', 'Dispute not found');
    }

    if (dispute.status !== DisputeStatus.OPEN) {
      throw new ApiError(
        400,
        'INVALID_STATUS',
        `Dispute is already ${dispute.status}`
      );
    }

    return await this.disputeRepository.updateStatus(
      disputeId,
      DisputeStatus.REVIEWING,
      {
        adminNotes,
      }
    );
  }

  /**
   * Resolve a dispute (admin only)
   * Can either dismiss the dispute or provide a new outcome
   */
  async resolveDispute(
    disputeId: string,
    action: 'DISMISS' | 'RESOLVE_NEW_OUTCOME',
    data: {
      resolution: string;
      adminNotes?: string;
      newWinningOutcome?: number; // 0 or 1
    }
  ) {
    const dispute = await this.disputeRepository.findById(disputeId);
    if (!dispute) {
      throw new ApiError(404, 'DISPUTE_NOT_FOUND', 'Dispute not found');
    }

    const market = await this.marketRepository.findById(dispute.marketId);
    if (!market) {
      throw new ApiError(404, 'MARKET_NOT_FOUND', 'Market not found');
    }

    if (action === 'DISMISS') {
      // Dismiss the dispute, return market to previous status (Resolved if it was resolved before)
      await this.disputeRepository.updateStatus(
        disputeId,
        DisputeStatus.DISMISSED,
        {
          resolution: data.resolution,
          adminNotes: data.adminNotes,
          resolvedAt: new Date(),
        }
      );

      // Restore market status to RESOLVED
      await this.marketRepository.updateMarketStatus(
        dispute.marketId,
        MarketStatus.RESOLVED
      );
    } else {
      // Resolve with new outcome
      if (data.newWinningOutcome === undefined) {
        throw new ApiError(
          400,
          'MISSING_OUTCOME',
          'New winning outcome is required for resolution'
        );
      }

      await this.disputeRepository.updateStatus(
        disputeId,
        DisputeStatus.RESOLVED,
        {
          resolution: data.resolution,
          adminNotes: data.adminNotes,
          resolvedAt: new Date(),
        }
      );

      // Update market with new outcome and set status to RESOLVED
      await this.marketRepository.updateMarketStatus(
        dispute.marketId,
        MarketStatus.RESOLVED,
        {
          resolvedAt: new Date(),
          winningOutcome: data.newWinningOutcome,
          resolutionSource: `Dispute Resolution: ${data.resolution}`,
        }
      );
    }

    return await this.disputeRepository.findById(disputeId);
  }

  async getDisputeDetails(disputeId: string) {
    return await this.disputeRepository.findById(disputeId);
  }

  async listDisputes(status?: DisputeStatus) {
    if (status) {
      return await this.disputeRepository.findByStatus(status);
    }
    return await this.disputeRepository.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const disputeService = new DisputeService();
