import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PredictionService } from '../../src/services/prediction.service.js';
import { MarketStatus, PredictionStatus } from '@prisma/client';
import * as cryptoUtils from '../../src/utils/crypto.js';
import { PredictionRepository } from '../../src/repositories/prediction.repository.js';
import { MarketRepository } from '../../src/repositories/market.repository.js';
import { UserRepository } from '../../src/repositories/user.repository.js';

// Define hoisted mocks
const {
  mockPredictionRepo,
  mockMarketRepo,
  mockUserRepo,
  mockBlockchainService,
} = vi.hoisted(() => ({
  mockPredictionRepo: {
    findById: vi.fn(),
    findByUserAndMarket: vi.fn(),
    createPrediction: vi.fn(),
    revealPrediction: vi.fn(),
    claimWinnings: vi.fn(),
    findUserPredictions: vi.fn(),
    findMarketPredictions: vi.fn(),
    getUnclaimedWinnings: vi.fn(),
    getUserPredictionStats: vi.fn(),
    getMarketPredictionStats: vi.fn(),
  },
  mockMarketRepo: {
    findById: vi.fn(),
    updateMarketVolume: vi.fn(),
  },
  mockUserRepo: {
    findById: vi.fn(),
    updateBalance: vi.fn(),
  },
  mockBlockchainService: {
    commitPrediction: vi.fn(),
    revealPrediction: vi.fn(),
    claimWinnings: vi.fn(),
  },
}));

// Mock the repositories to return the shared instances
vi.mock('../../src/repositories/prediction.repository.js', () => ({
  PredictionRepository: vi.fn().mockImplementation(() => mockPredictionRepo),
}));

vi.mock('../../src/repositories/market.repository.js', () => ({
  MarketRepository: vi.fn().mockImplementation(() => mockMarketRepo),
}));

vi.mock('../../src/repositories/user.repository.js', () => ({
  UserRepository: vi.fn().mockImplementation(() => mockUserRepo),
}));

vi.mock('../../src/services/blockchain/market.js', () => ({
  marketBlockchainService: mockBlockchainService,
  MarketBlockchainService: vi
    .fn()
    .mockImplementation(() => mockBlockchainService),
}));

// Mock the transaction helper
vi.mock('../../src/database/transaction.js', () => ({
  executeTransaction: vi.fn((callback) => callback({})),
}));

// Mock the crypto utils
vi.mock('../../src/utils/crypto.js', async () => {
  const actual = (await vi.importActual('../../src/utils/crypto.js')) as any;
  return {
    ...actual,
    generateSalt: vi.fn(() => 'mock-salt'),
    createCommitmentHash: vi.fn(() => 'mock-hash'),
    encrypt: vi.fn(() => ({ encrypted: 'mock-encrypted', iv: 'mock-iv' })),
    decrypt: vi.fn(() => 'mock-salt'),
  };
});

describe('PredictionService', () => {
  let predictionService: PredictionService;

  beforeEach(() => {
    vi.clearAllMocks();
    predictionService = new PredictionService();

    // Default blockchain mocks
    mockBlockchainService.commitPrediction.mockResolvedValue({
      txHash: 'mock-commit-tx',
    });
    mockBlockchainService.revealPrediction.mockResolvedValue({
      txHash: 'mock-reveal-tx',
    });
  });

  describe('commitPrediction', () => {
    const userId = 'user-1';
    const marketId = 'market-1';
    const predictedOutcome = 1;
    const amountUsdc = 100;

    it('should successfully commit a prediction', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      mockMarketRepo.findById.mockResolvedValue({
        id: marketId,
        contractAddress: 'stellar-market-addr',
        status: MarketStatus.OPEN,
        closingAt: futureDate,
      });
      mockPredictionRepo.findByUserAndMarket.mockResolvedValue(null);
      mockUserRepo.findById.mockResolvedValue({
        id: userId,
        usdcBalance: 500,
      });

      mockPredictionRepo.createPrediction.mockResolvedValue({ id: 'pred-1' });

      const result = await predictionService.commitPrediction(
        userId,
        marketId,
        predictedOutcome,
        amountUsdc
      );

      expect(result).toBeDefined();
      expect(mockBlockchainService.commitPrediction).toHaveBeenCalledWith(
        'stellar-market-addr',
        'mock-hash',
        amountUsdc
      );
      expect(mockPredictionRepo.createPrediction).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          marketId,
          commitmentHash: 'mock-hash',
          status: PredictionStatus.COMMITTED,
        })
      );
      expect(mockUserRepo.updateBalance).toHaveBeenCalledWith(userId, 400);
      expect(mockMarketRepo.updateMarketVolume).toHaveBeenCalledWith(
        marketId,
        amountUsdc,
        true
      );
    });

    it('should throw error if market not found', async () => {
      mockMarketRepo.findById.mockResolvedValue(null);

      await expect(
        predictionService.commitPrediction(
          userId,
          marketId,
          predictedOutcome,
          amountUsdc
        )
      ).rejects.toThrow('Market not found');
    });

    it('should throw error if market is not open', async () => {
      mockMarketRepo.findById.mockResolvedValue({
        status: MarketStatus.CLOSED,
      });

      await expect(
        predictionService.commitPrediction(
          userId,
          marketId,
          predictedOutcome,
          amountUsdc
        )
      ).rejects.toThrow('Market is not open for predictions');
    });

    it('should throw error if market has already closed', async () => {
      const pastDate = new Date();
      pastDate.setFullYear(pastDate.getFullYear() - 1);

      mockMarketRepo.findById.mockResolvedValue({
        status: MarketStatus.OPEN,
        closingAt: pastDate,
      });

      await expect(
        predictionService.commitPrediction(
          userId,
          marketId,
          predictedOutcome,
          amountUsdc
        )
      ).rejects.toThrow('Market has closed');
    });

    it('should throw error if user already has a prediction', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      mockMarketRepo.findById.mockResolvedValue({
        status: MarketStatus.OPEN,
        closingAt: futureDate,
      });
      mockPredictionRepo.findByUserAndMarket.mockResolvedValue({
        id: 'existing-pred',
      });

      await expect(
        predictionService.commitPrediction(
          userId,
          marketId,
          predictedOutcome,
          amountUsdc
        )
      ).rejects.toThrow('User already has a prediction for this market');
    });

    it('should throw error if amount is zero or negative', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      mockMarketRepo.findById.mockResolvedValue({
        status: MarketStatus.OPEN,
        closingAt: futureDate,
      });
      mockPredictionRepo.findByUserAndMarket.mockResolvedValue(null);

      await expect(
        predictionService.commitPrediction(
          userId,
          marketId,
          predictedOutcome,
          0
        )
      ).rejects.toThrow('Amount must be greater than 0');
    });

    it('should throw error if predicted outcome is invalid', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      mockMarketRepo.findById.mockResolvedValue({
        status: MarketStatus.OPEN,
        closingAt: futureDate,
      });
      mockPredictionRepo.findByUserAndMarket.mockResolvedValue(null);

      await expect(
        predictionService.commitPrediction(userId, marketId, 2, amountUsdc)
      ).rejects.toThrow('Predicted outcome must be 0 (NO) or 1 (YES)');
    });

    it('should throw error if user balance is insufficient', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      mockMarketRepo.findById.mockResolvedValue({
        status: MarketStatus.OPEN,
        closingAt: futureDate,
      });
      mockPredictionRepo.findByUserAndMarket.mockResolvedValue(null);
      mockUserRepo.findById.mockResolvedValue({
        id: userId,
        usdcBalance: 50,
      });

      await expect(
        predictionService.commitPrediction(
          userId,
          marketId,
          predictedOutcome,
          amountUsdc
        )
      ).rejects.toThrow('Insufficient balance');
    });
  });

  describe('revealPrediction', () => {
    const userId = 'user-1';
    const predictionId = 'pred-1';
    const marketId = 'market-1';

    it('should successfully reveal a prediction', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      mockPredictionRepo.findById.mockResolvedValue({
        id: predictionId,
        userId,
        marketId,
        status: PredictionStatus.COMMITTED,
        encryptedSalt: 'enc-salt',
        saltIv: 'iv',
        commitmentHash: 'mock-hash',
      });

      mockMarketRepo.findById.mockResolvedValue({
        id: marketId,
        contractAddress: 'stellar-market-addr',
        closingAt: futureDate,
      });

      // Special mock for createCommitmentHash to simulate correct outcome search
      vi.mocked(cryptoUtils.createCommitmentHash).mockImplementation(
        (uid, mid, outcome, salt) => {
          if (outcome === 1) return 'mock-hash';
          return 'wrong-hash';
        }
      );

      mockPredictionRepo.revealPrediction.mockResolvedValue({
        id: predictionId,
        status: PredictionStatus.REVEALED,
      });

      const result = await predictionService.revealPrediction(
        userId,
        predictionId,
        marketId
      );

      expect(result).toBeDefined();
      expect(mockBlockchainService.revealPrediction).toHaveBeenCalledWith(
        'stellar-market-addr',
        1,
        'mock-salt'
      );
      expect(mockPredictionRepo.revealPrediction).toHaveBeenCalledWith(
        predictionId,
        1,
        'mock-reveal-tx'
      );
    });

    it('should throw error if prediction not found', async () => {
      mockPredictionRepo.findById.mockResolvedValue(null);

      await expect(
        predictionService.revealPrediction(userId, predictionId, marketId)
      ).rejects.toThrow('Prediction not found');
    });

    it('should throw error if unauthorized', async () => {
      mockPredictionRepo.findById.mockResolvedValue({
        userId: 'wrong-user',
      });

      await expect(
        predictionService.revealPrediction(userId, predictionId, marketId)
      ).rejects.toThrow('Unauthorized');
    });

    it('should throw error if market ID mismatch', async () => {
      mockPredictionRepo.findById.mockResolvedValue({
        userId,
        marketId: 'wrong-market',
      });

      await expect(
        predictionService.revealPrediction(userId, predictionId, marketId)
      ).rejects.toThrow('Market ID mismatch');
    });

    it('should throw error if prediction status is not COMMITTED', async () => {
      mockPredictionRepo.findById.mockResolvedValue({
        userId,
        marketId,
        status: PredictionStatus.REVEALED,
      });

      await expect(
        predictionService.revealPrediction(userId, predictionId, marketId)
      ).rejects.toThrow('Prediction already revealed or invalid status');
    });

    it('should throw error if salt or iv missing', async () => {
      mockPredictionRepo.findById.mockResolvedValue({
        userId,
        marketId,
        status: PredictionStatus.COMMITTED,
        encryptedSalt: null,
        saltIv: null,
      });

      await expect(
        predictionService.revealPrediction(userId, predictionId, marketId)
      ).rejects.toThrow('Salt not found - cannot reveal prediction');
    });

    it('should throw error if reveal period has ended', async () => {
      const pastDate = new Date();
      pastDate.setFullYear(pastDate.getFullYear() - 1);

      mockPredictionRepo.findById.mockResolvedValue({
        userId,
        marketId,
        status: PredictionStatus.COMMITTED,
        encryptedSalt: 'enc-salt',
        saltIv: 'iv',
      });

      mockMarketRepo.findById.mockResolvedValue({
        closingAt: pastDate,
      });

      await expect(
        predictionService.revealPrediction(userId, predictionId, marketId)
      ).rejects.toThrow('Reveal period has ended');
    });

    it('should throw error if commitment hash verification fails', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      mockPredictionRepo.findById.mockResolvedValue({
        userId,
        marketId,
        status: PredictionStatus.COMMITTED,
        encryptedSalt: 'enc-salt',
        saltIv: 'iv',
        commitmentHash: 'original-hash',
      });

      mockMarketRepo.findById.mockResolvedValue({
        closingAt: futureDate,
      });

      // Mock createCommitmentHash to never return the original hash
      vi.mocked(cryptoUtils.createCommitmentHash).mockReturnValue(
        'different-hash'
      );

      await expect(
        predictionService.revealPrediction(userId, predictionId, marketId)
      ).rejects.toThrow(
        'Invalid commitment hash - cannot determine predicted outcome'
      );
    });
  });

  describe('claimWinnings', () => {
    const userId = 'user-1';
    const predictionId = 'pred-1';

    it('should successfully claim winnings for a winning prediction', async () => {
      mockPredictionRepo.findById.mockResolvedValue({
        id: predictionId,
        userId,
        status: PredictionStatus.SETTLED,
        isWinner: true,
        winningsClaimed: false,
        pnlUsd: 180,
      });

      mockUserRepo.findById.mockResolvedValue({
        id: userId,
        usdcBalance: 400,
      });

      const result = await predictionService.claimWinnings(
        userId,
        predictionId
      );

      expect(result.winnings).toBe(180);
      expect(mockPredictionRepo.claimWinnings).toHaveBeenCalledWith(
        predictionId
      );
      expect(mockUserRepo.updateBalance).toHaveBeenCalledWith(userId, 580);
    });

    it('should throw error if prediction not found', async () => {
      mockPredictionRepo.findById.mockResolvedValue(null);

      await expect(
        predictionService.claimWinnings(userId, predictionId)
      ).rejects.toThrow('Prediction not found');
    });

    it('should throw error if unauthorized', async () => {
      mockPredictionRepo.findById.mockResolvedValue({
        userId: 'wrong-user',
      });

      await expect(
        predictionService.claimWinnings(userId, predictionId)
      ).rejects.toThrow('Unauthorized');
    });

    it('should throw error if prediction is not settled', async () => {
      mockPredictionRepo.findById.mockResolvedValue({
        userId,
        status: PredictionStatus.REVEALED,
      });

      await expect(
        predictionService.claimWinnings(userId, predictionId)
      ).rejects.toThrow('Prediction not settled');
    });

    it('should throw error if prediction did not win', async () => {
      mockPredictionRepo.findById.mockResolvedValue({
        userId,
        status: PredictionStatus.SETTLED,
        isWinner: false,
      });

      await expect(
        predictionService.claimWinnings(userId, predictionId)
      ).rejects.toThrow('Prediction did not win');
    });

    it('should throw error if winnings already claimed', async () => {
      mockPredictionRepo.findById.mockResolvedValue({
        userId,
        status: PredictionStatus.SETTLED,
        isWinner: true,
        winningsClaimed: true,
      });

      await expect(
        predictionService.claimWinnings(userId, predictionId)
      ).rejects.toThrow('Winnings already claimed');
    });

    it('should throw error if no winnings to claim', async () => {
      mockPredictionRepo.findById.mockResolvedValue({
        userId,
        status: PredictionStatus.SETTLED,
        isWinner: true,
        winningsClaimed: false,
        pnlUsd: 0,
      });

      await expect(
        predictionService.claimWinnings(userId, predictionId)
      ).rejects.toThrow('No winnings to claim');
    });
  });
});
