import {
  treasuryService as blockchainTreasuryService,
  TreasuryBalances,
} from './blockchain/treasury.js';
import { DistributionRepository } from '../repositories/distribution.repository.js';
import { DistributionType, DistributionStatus } from '@prisma/client';

export class TreasuryService {
  private distributionRepository: DistributionRepository;

  constructor() {
    this.distributionRepository = new DistributionRepository();
  }

  async getBalances(): Promise<TreasuryBalances> {
    return await blockchainTreasuryService.getBalances();
  }

  async distributeLeaderboard(
    recipients: Array<{ address: string; amount: string }>,
    initiatedBy: string
  ) {
    const totalAmount = recipients.reduce(
      (sum, r) => sum + parseFloat(r.amount),
      0
    );

    const result =
      await blockchainTreasuryService.distributeLeaderboard(recipients);

    const distribution = await this.distributionRepository.createDistribution({
      distributionType: DistributionType.LEADERBOARD,
      totalAmount,
      recipientCount: result.recipientCount,
      txHash: result.txHash,
      initiatedBy,
      metadata: { recipients },
    });

    await this.distributionRepository.updateStatus(
      distribution.id,
      DistributionStatus.CONFIRMED
    );

    return {
      distributionId: distribution.id,
      txHash: result.txHash,
      totalDistributed: result.totalDistributed,
      recipientCount: result.recipientCount,
    };
  }

  async distributeCreator(
    marketId: string,
    creatorAddress: string,
    amount: string,
    initiatedBy: string
  ) {
    const result = await blockchainTreasuryService.distributeCreator(
      marketId,
      creatorAddress,
      amount
    );

    const distribution = await this.distributionRepository.createDistribution({
      distributionType: DistributionType.CREATOR,
      totalAmount: parseFloat(amount),
      recipientCount: 1,
      txHash: result.txHash,
      initiatedBy,
      metadata: { marketId, creatorAddress },
    });

    await this.distributionRepository.updateStatus(
      distribution.id,
      DistributionStatus.CONFIRMED
    );

    return {
      distributionId: distribution.id,
      txHash: result.txHash,
      totalDistributed: result.totalDistributed,
      recipientCount: result.recipientCount,
    };
  }

  async getDistributionHistory(limit: number = 20) {
    return await this.distributionRepository.findRecent(limit);
  }
}
