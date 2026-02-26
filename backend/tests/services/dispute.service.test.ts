import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DisputeService } from '../../src/services/dispute.service.js';
import { DisputeStatus, MarketStatus } from '@prisma/client';

describe('DisputeService Unit Tests', () => {
    let disputeService: DisputeService;
    let mockDisputeRepository: any;
    let mockMarketRepository: any;

    beforeEach(() => {
        mockDisputeRepository = {
            findById: vi.fn(),
            create: vi.fn(),
            updateStatus: vi.fn(),
            findByStatus: vi.fn(),
            findMany: vi.fn(),
        };
        mockMarketRepository = {
            findById: vi.fn(),
            updateMarketStatus: vi.fn(),
        };

        disputeService = new DisputeService(mockDisputeRepository, mockMarketRepository);

        // Mock logger
        vi.mock('../../src/utils/logger.js', () => ({
            logger: {
                info: vi.fn(),
                error: vi.fn(),
                warn: vi.fn(),
            },
        }));
    });

    describe('submitDispute', () => {
        it('should throw error if market not found', async () => {
            mockMarketRepository.findById.mockResolvedValue(null);
            await expect(
                disputeService.submitDispute({
                    marketId: '1',
                    userId: 'u1',
                    reason: 'bad outcome',
                })
            ).rejects.toThrow('Market not found');
        });

        it('should throw error if market status is OPEN', async () => {
            mockMarketRepository.findById.mockResolvedValue({ status: MarketStatus.OPEN });
            await expect(
                disputeService.submitDispute({
                    marketId: '1',
                    userId: 'u1',
                    reason: 'bad outcome',
                })
            ).rejects.toThrow('Market in OPEN status cannot be disputed');
        });

        it('should create dispute and update market status to DISPUTED', async () => {
            mockMarketRepository.findById.mockResolvedValue({ id: '1', status: MarketStatus.RESOLVED });
            mockDisputeRepository.create.mockResolvedValue({ id: 'd1', status: DisputeStatus.OPEN });

            const result = await disputeService.submitDispute({
                marketId: '1',
                userId: 'u1',
                reason: 'bad outcome',
            });

            expect(mockDisputeRepository.create).toHaveBeenCalled();
            expect(mockMarketRepository.updateMarketStatus).toHaveBeenCalledWith('1', MarketStatus.DISPUTED);
            expect(result.status).toBe(DisputeStatus.OPEN);
        });
    });

    describe('reviewDispute', () => {
        it('should update status to REVIEWING', async () => {
            mockDisputeRepository.findById.mockResolvedValue({ id: 'd1', status: DisputeStatus.OPEN });
            mockDisputeRepository.updateStatus.mockResolvedValue({
                id: 'd1',
                status: DisputeStatus.REVIEWING,
            });

            const result = await disputeService.reviewDispute('d1', 'Checking evidence');

            expect(mockDisputeRepository.updateStatus).toHaveBeenCalledWith(
                'd1',
                DisputeStatus.REVIEWING,
                { adminNotes: 'Checking evidence' }
            );
            expect(result.status).toBe(DisputeStatus.REVIEWING);
        });
    });

    describe('resolveDispute', () => {
        it('should dismiss dispute and restore market status', async () => {
            mockDisputeRepository.findById.mockResolvedValue({ id: 'd1', marketId: 'm1' });
            mockMarketRepository.findById.mockResolvedValue({ id: 'm1' });
            mockDisputeRepository.updateStatus.mockResolvedValue({
                id: 'd1',
                status: DisputeStatus.DISMISSED,
            });

            await disputeService.resolveDispute('d1', 'DISMISS', { resolution: 'Invalid claim' });

            expect(mockDisputeRepository.updateStatus).toHaveBeenCalledWith(
                'd1',
                DisputeStatus.DISMISSED,
                expect.any(Object)
            );
            expect(mockMarketRepository.updateMarketStatus).toHaveBeenCalledWith('m1', MarketStatus.RESOLVED);
        });

        it('should resolve with new outcome', async () => {
            mockDisputeRepository.findById.mockResolvedValue({ id: 'd1', marketId: 'm1' });
            mockMarketRepository.findById.mockResolvedValue({ id: 'm1' });
            mockDisputeRepository.updateStatus.mockResolvedValue({
                id: 'd1',
                status: DisputeStatus.RESOLVED,
            });

            await disputeService.resolveDispute('d1', 'RESOLVE_NEW_OUTCOME', {
                resolution: 'Corrected outcome',
                newWinningOutcome: 0,
            });

            expect(mockDisputeRepository.updateStatus).toHaveBeenCalledWith(
                'd1',
                DisputeStatus.RESOLVED,
                expect.any(Object)
            );
            expect(mockMarketRepository.updateMarketStatus).toHaveBeenCalledWith(
                'm1',
                MarketStatus.RESOLVED,
                expect.objectContaining({ winningOutcome: 0 })
            );
        });
    });
});
