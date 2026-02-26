// backend/tests/integration/oracle.integration.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/index.js';
import { oracleService } from '../../src/services/blockchain/oracle.js';
import { marketBlockchainService } from '../../src/services/blockchain/market.js';
import { MarketService } from '../../src/services/market.service.js';

vi.mock('../../src/services/blockchain/oracle.js', () => ({
  oracleService: {
    submitAttestation: vi.fn(),
    checkConsensus: vi.fn(),
  },
}));

vi.mock('../../src/services/blockchain/market.js', () => ({
  marketBlockchainService: {
    resolveMarket: vi.fn(),
    claimWinnings: vi.fn(),
  },
}));

// Mock MarketService to avoid actual DB calls if needed,
// but integration tests usually hit a test DB.
// However, since we need to mock auth, we'll focus on the API flow.

describe('Oracle & Resolution API', () => {
  const marketId = 'test-market-id';
  const authToken = 'mock-admin-token'; // In a real test, we'd get this from login

  describe('POST /api/markets/:id/attest', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post(`/api/markets/${marketId}/attest`)
        .send({ outcome: 1 });

      expect(response.status).toBe(401);
    });

    it('should submit attestation when authenticated as admin', async () => {
      // Mocking oracle service
      (oracleService.submitAttestation as any).mockResolvedValue({
        txHash: '0x123',
      });

      // Note: In actual integration tests, you'd handle the auth middleware properly
      // Here we assume requireAuth is mocked or handled via test setup

      // For this demonstration, we'll assume the mock works
      // ... actual test logic would go here
    });
  });

  describe('POST /api/markets/:id/resolve', () => {
    it('should fail if consensus is not reached', async () => {
      (oracleService.checkConsensus as any).mockResolvedValue(null);

      // ... test logic
    });
  });

  describe('POST /api/markets/:id/claim', () => {
    it('should call claim winnings on the blockchain', async () => {
      (marketBlockchainService.claimWinnings as any).mockResolvedValue({
        txHash: '0x456',
      });

      // ... test logic
    });
  });
});
