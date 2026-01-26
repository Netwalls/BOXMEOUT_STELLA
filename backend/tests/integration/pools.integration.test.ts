// backend/tests/integration/pools.integration.test.ts
// Integration tests for POST /api/markets/:id/pool

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/index.js';
import { MarketStatus } from '@prisma/client';
import { ammService } from '../../src/services/blockchain/amm.js';

// Mock JWT verification
vi.mock('../../src/utils/jwt.js', () => ({
  verifyAccessToken: vi.fn().mockReturnValue({
    userId: 'test-user-id',
    publicKey: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    tier: 'BEGINNER',
  }),
}));

// Mock AMM blockchain service
vi.mock('../../src/services/blockchain/amm.js', () => ({
  ammService: {
    createPool: vi.fn().mockResolvedValue({
      txHash: 'mock-tx-hash-amm',
      reserves: { yes: 5000000n, no: 5000000n },
      odds: { yes: 0.5, no: 0.5 },
    }),
  },
}));

// Mock database
const marketOpen = {
  id: 'market-open-id',
  contractAddress: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
  status: MarketStatus.OPEN,
  yesLiquidity: 0,
  noLiquidity: 0,
};

const prismaMarketMock = {
  findUnique: vi.fn(async ({ where }: any) => {
    if (where.id === marketOpen.id) return marketOpen;
    return null;
  }),
  update: vi.fn(async ({ where, data }: any) => {
    return { ...marketOpen, ...data };
  }),
};

vi.mock('../../src/database/prisma.js', () => ({
  prisma: {
    market: prismaMarketMock,
  },
}));

describe('POST /api/markets/:id/pool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Happy path creates pool', async () => {
    const response = await request(app)
      .post(`/api/markets/${marketOpen.id}/pool`)
      .set('Authorization', 'Bearer mocktoken')
      .send({ initial_liquidity: 10 }) // 10 USDC
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      marketId: marketOpen.id,
      txHash: 'mock-tx-hash-amm',
      odds: { yes: 0.5, no: 0.5 },
    });

    // Liquidity persisted scaled down to units
    expect(prismaMarketMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ yesLiquidity: 5, noLiquidity: 5 }) })
    );

    // Blockchain called with market contract id and scaled amount
    expect(ammService.createPool).toHaveBeenCalledWith(
      expect.objectContaining({ marketId: marketOpen.contractAddress })
    );
  });

  it('Non-existent market returns 404', async () => {
    const response = await request(app)
      .post('/api/markets/missing-market/pool')
      .set('Authorization', 'Bearer mocktoken')
      .send({ initial_liquidity: 10 })
      .expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('Duplicate pool rejected', async () => {
    // Pretend pool exists
    marketOpen.yesLiquidity = 1;
    const response = await request(app)
      .post(`/api/markets/${marketOpen.id}/pool`)
      .set('Authorization', 'Bearer mocktoken')
      .send({ initial_liquidity: 10 })
      .expect(409);

    expect(response.body.error.code).toBe('DUPLICATE');
  });

  it('Transaction hash stored', async () => {
    // Reset to zero liquidity
    marketOpen.yesLiquidity = 0;
    marketOpen.noLiquidity = 0;

    await request(app)
      .post(`/api/markets/${marketOpen.id}/pool`)
      .set('Authorization', 'Bearer mocktoken')
      .send({ initial_liquidity: 10 })
      .expect(201);

    // Check update called with poolTxHash
    expect(prismaMarketMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ poolTxHash: 'mock-tx-hash-amm' }) })
    );
  });
});
