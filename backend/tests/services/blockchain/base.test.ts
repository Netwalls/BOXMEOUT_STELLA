// backend/tests/services/blockchain/base.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseBlockchainService } from '../../../src/services/blockchain/base.js';

// Mock Prisma
vi.mock('../../../src/database/prisma.js', () => ({
  prisma: {
    blockchainDeadLetterQueue: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}));

// Mock Stellar SDK
vi.mock('@stellar/stellar-sdk', () => ({
  rpc: {
    Server: vi.fn().mockImplementation(() => ({
      getTransaction: vi.fn(),
    })),
  },
  Networks: {
    TESTNET: 'Test SDF Network ; September 2015',
  },
  Keypair: {
    fromSecret: vi.fn(),
    random: vi.fn().mockReturnValue({
      publicKey: vi.fn().mockReturnValue('GDUMMY...'),
    }),
  },
}));

// Concrete class for testing
class TestBlockchainService extends BaseBlockchainService {
  constructor() {
    super('TestService');
  }

  public async publicWaitForTransaction(
    txHash: string,
    fn: string,
    params: any,
    netRetries?: number,
    pollRetries?: number
  ) {
    return this.waitForTransaction(txHash, fn, params, netRetries, pollRetries);
  }
}

describe('BaseBlockchainService', () => {
  let service: TestBlockchainService;
  let mockGetTransaction: any;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TestBlockchainService();
    // @ts-ignore - accessing protected member for testing
    mockGetTransaction = service.rpcServer.getTransaction;
  });

  it('should succeed if transaction is successful on first poll', async () => {
    mockGetTransaction.mockResolvedValueOnce({ status: 'SUCCESS' });
    const result = await service.publicWaitForTransaction('hash', 'testFn', {});
    expect(result.status).toBe('SUCCESS');
    expect(mockGetTransaction).toHaveBeenCalledTimes(1);
  });

  it('should retry with backoff if transaction is NOT_FOUND', async () => {
    // Mock sleep to be fast
    vi.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

    mockGetTransaction
      .mockResolvedValueOnce({ status: 'NOT_FOUND' })
      .mockResolvedValueOnce({ status: 'NOT_FOUND' })
      .mockResolvedValueOnce({ status: 'SUCCESS' });

    const result = await service.publicWaitForTransaction('hash', 'testFn', {});
    expect(result.status).toBe('SUCCESS');
    expect(mockGetTransaction).toHaveBeenCalledTimes(3);
  });

  it('should retry network errors and eventually fail to DLQ', async () => {
    vi.spyOn(service as any, 'sleep').mockResolvedValue(undefined);
    mockGetTransaction.mockRejectedValue(new Error('Network error'));

    // Max network retries = 2 for faster test
    await expect(
      service.publicWaitForTransaction('hash', 'testFn', {}, 2, 10)
    ).rejects.toThrow('Max network retries reached');

    expect(mockGetTransaction).toHaveBeenCalledTimes(2);

    // Check DLQ call
    const { prisma } = await import('../../../src/database/prisma.js');
    expect(prisma.blockchainDeadLetterQueue.upsert).toHaveBeenCalled();
  });

  it('should stop and fail immediately to DLQ if transaction status is FAILED', async () => {
    mockGetTransaction.mockResolvedValueOnce({ status: 'FAILED' });

    await expect(
      service.publicWaitForTransaction('hash', 'testFn', {})
    ).rejects.toThrow('Transaction failed on blockchain');

    expect(mockGetTransaction).toHaveBeenCalledTimes(1);
    const { prisma } = await import('../../../src/database/prisma.js');
    expect(prisma.blockchainDeadLetterQueue.upsert).toHaveBeenCalled();
  });
});
