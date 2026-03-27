// Dispute repository - data access layer for disputes
import { Dispute, DisputeStatus } from '@prisma/client';
import { BaseRepository, toRepositoryError } from './base.repository.js';

export class DisputeRepository extends BaseRepository<Dispute> {
  getModelName(): string {
    return 'dispute';
  }

  async findByMarketId(marketId: string): Promise<Dispute[]> {
    try {
      return await this.prisma.dispute.findMany({
        where: { marketId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async findByStatus(status: DisputeStatus): Promise<Dispute[]> {
    try {
      return await this.prisma.dispute.findMany({
        where: { status },
        orderBy: { createdAt: 'desc' },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async updateStatus(
    id: string,
    status: DisputeStatus,
    updateData?: { resolution?: string; adminNotes?: string; resolvedAt?: Date }
  ): Promise<Dispute> {
    try {
      return await this.prisma.dispute.update({
        where: { id },
        data: { status, ...updateData },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }
}
