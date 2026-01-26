// Integration tests for prediction commit-reveal flow
import { config } from 'dotenv';
config(); // Load environment variables

import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient, MarketStatus, PredictionStatus } from '@prisma/client';
import { PredictionService } from '../../src/services/prediction.service.js';
import { createCommitmentHash, decrypt } from '../../src/utils/crypto.js';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL_TEST ||
        process.env.DATABASE_URL ||
        'postgresql://postgres:password@localhost:5432/boxmeout_test',
    },
  },
});

describe('Prediction Service - Commit-Reveal Flow', () => {
  let predictionService: PredictionService;
  let testUser: any;
  let testMarket: any;

  beforeEach(async () => {
    // Clean up test data
    await prisma.prediction.deleteMany();
    await prisma.market.deleteMany();
    await prisma.user.deleteMany();

    // Create test user with balance
    testUser = await prisma.user.create({
      data: {
        email: 'test@example.com',
        username: 'testuser',
        passwordHash: 'hashedpassword',
        usdcBalance: 10000,
      },
    });

    // Create test market
    testMarket = await prisma.market.create({
      data: {
        contractAddress: '0xtest123',
        title: 'Test Market',
        description: 'Test market description',
        category: 'WRESTLING',
        status: MarketStatus.OPEN,
        creatorId: testUser.id,
        outcomeA: 'YES',
        outcomeB: 'NO',
        closingAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      },
    });

    predictionService = new PredictionService();
  });

  describe('commitPrediction', () => {
    it('should commit a prediction with encrypted salt', async () => {
      const result = await predictionService.commitPrediction(
        testUser.id,
        testMarket.id,
        1, // YES outcome
        100 // 100 USDC
      );

      expect(result.id).toBeDefined();
      expect(result.commitmentHash).toBeDefined();
      expect(result.encryptedSalt).toBeDefined();
      expect(result.saltIv).toBeDefined();
      expect(result.transactionHash).toBeDefined();
      expect(result.status).toBe(PredictionStatus.COMMITTED);
      expect(Number(result.amountUsdc)).toBe(100);

      // Verify user balance was deducted
      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });
      expect(Number(updatedUser?.usdcBalance)).toBe(9900);
    });

    it('should store salt securely (encrypted)', async () => {
      const result = await predictionService.commitPrediction(
        testUser.id,
        testMarket.id,
        0, // NO outcome
        50
      );

      // Verify encrypted salt is not the same as plain salt
      expect(result.encryptedSalt).toBeDefined();
      expect(result.encryptedSalt).not.toMatch(/^[0-9a-f]{64}$/); // Not a plain hex string

      // Verify we can decrypt it
      const decryptedSalt = decrypt(result.encryptedSalt!, result.saltIv!);
      expect(decryptedSalt).toBeDefined();
      expect(decryptedSalt).toMatch(/^[0-9a-f]{64}$/); // Should be 32-byte hex

      // Verify commitment hash matches
      const reconstructedHash = createCommitmentHash(
        testUser.id,
        testMarket.id,
        0,
        decryptedSalt
      );
      expect(reconstructedHash).toBe(result.commitmentHash);
    });

    it('should reject commit with insufficient balance', async () => {
      await expect(
        predictionService.commitPrediction(
          testUser.id,
          testMarket.id,
          1,
          20000 // More than user balance
        )
      ).rejects.toThrow('Insufficient balance');
    });

    it('should reject commit with invalid outcome', async () => {
      await expect(
        predictionService.commitPrediction(
          testUser.id,
          testMarket.id,
          2, // Invalid outcome
          100
        )
      ).rejects.toThrow('Predicted outcome must be 0 (NO) or 1 (YES)');
    });

    it('should reject duplicate commit for same market', async () => {
      // First commit succeeds
      await predictionService.commitPrediction(
        testUser.id,
        testMarket.id,
        1,
        100
      );

      // Second commit should fail
      await expect(
        predictionService.commitPrediction(testUser.id, testMarket.id, 0, 50)
      ).rejects.toThrow('User already has a prediction for this market');
    });

    it('should reject commit for closed market', async () => {
      // Close the market
      await prisma.market.update({
        where: { id: testMarket.id },
        data: { closingAt: new Date(Date.now() - 1000) },
      });

      await expect(
        predictionService.commitPrediction(testUser.id, testMarket.id, 1, 100)
      ).rejects.toThrow('Market has closed');
    });

    it('should store transaction hash', async () => {
      const result = await predictionService.commitPrediction(
        testUser.id,
        testMarket.id,
        1,
        100
      );

      expect(result.transactionHash).toBeDefined();
      expect(result.transactionHash).toMatch(/^mock-tx-hash-/);
    });
  });

  describe('revealPrediction', () => {
    let committedPrediction: any;

    beforeEach(async () => {
      // Commit a prediction first
      committedPrediction = await predictionService.commitPrediction(
        testUser.id,
        testMarket.id,
        1, // YES
        100
      );
    });

    it('should reveal prediction using stored encrypted salt', async () => {
      const result = await predictionService.revealPrediction(
        testUser.id,
        committedPrediction.id,
        testMarket.id
      );

      expect(result.id).toBe(committedPrediction.id);
      expect(result.predictedOutcome).toBe(1); // Should match committed outcome
      expect(result.status).toBe(PredictionStatus.REVEALED);
      expect(result.revealedAt).toBeDefined();
      expect(result.revealTxHash).toBeDefined();

      // Verify encrypted salt is cleared after reveal
      expect(result.encryptedSalt).toBeNull();
      expect(result.saltIv).toBeNull();
    });

    it('should use correct salt for hash validation', async () => {
      // Get the original encrypted salt
      const prediction = await prisma.prediction.findUnique({
        where: { id: committedPrediction.id },
      });

      const originalSalt = decrypt(
        prediction!.encryptedSalt!,
        prediction!.saltIv!
      );

      // Reveal
      const result = await predictionService.revealPrediction(
        testUser.id,
        committedPrediction.id,
        testMarket.id
      );

      // Verify the commitment hash matches
      const reconstructedHash = createCommitmentHash(
        testUser.id,
        testMarket.id,
        result.predictedOutcome!,
        originalSalt
      );
      expect(reconstructedHash).toBe(committedPrediction.commitmentHash);
    });

    it('should reject reveal with invalid prediction ID', async () => {
      await expect(
        predictionService.revealPrediction(
          testUser.id,
          'invalid-id',
          testMarket.id
        )
      ).rejects.toThrow('Prediction not found');
    });

    it('should reject reveal by wrong user', async () => {
      const anotherUser = await prisma.user.create({
        data: {
          email: 'another@example.com',
          username: 'anotheruser',
          passwordHash: 'hashedpassword',
          usdcBalance: 10000,
        },
      });

      await expect(
        predictionService.revealPrediction(
          anotherUser.id,
          committedPrediction.id,
          testMarket.id
        )
      ).rejects.toThrow('Unauthorized');
    });

    it('should reject double reveal', async () => {
      // First reveal succeeds
      await predictionService.revealPrediction(
        testUser.id,
        committedPrediction.id,
        testMarket.id
      );

      // Second reveal should fail
      await expect(
        predictionService.revealPrediction(
          testUser.id,
          committedPrediction.id,
          testMarket.id
        )
      ).rejects.toThrow('Prediction already revealed');
    });

    it('should reject reveal after market closes', async () => {
      // Close the market
      await prisma.market.update({
        where: { id: testMarket.id },
        data: { closingAt: new Date(Date.now() - 1000) },
      });

      await expect(
        predictionService.revealPrediction(
          testUser.id,
          committedPrediction.id,
          testMarket.id
        )
      ).rejects.toThrow('Reveal period has ended');
    });

    it('should reject reveal with market ID mismatch', async () => {
      const anotherMarket = await prisma.market.create({
        data: {
          contractAddress: '0xtest456',
          title: 'Another Market',
          description: 'Another market description',
          category: 'WRESTLING',
          status: MarketStatus.OPEN,
          creatorId: testUser.id,
          outcomeA: 'YES',
          outcomeB: 'NO',
          closingAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      await expect(
        predictionService.revealPrediction(
          testUser.id,
          committedPrediction.id,
          anotherMarket.id
        )
      ).rejects.toThrow('Market ID mismatch');
    });

    it('should store reveal transaction hash', async () => {
      const result = await predictionService.revealPrediction(
        testUser.id,
        committedPrediction.id,
        testMarket.id
      );

      expect(result.revealTxHash).toBeDefined();
      expect(result.revealTxHash).toMatch(/^mock-reveal-tx-/);
    });
  });

  describe('Complete Commit-Reveal Flow', () => {
    it('should complete full commit-reveal cycle', async () => {
      // Step 1: Commit prediction
      const commitment = await predictionService.commitPrediction(
        testUser.id,
        testMarket.id,
        1, // YES
        200
      );

      expect(commitment.status).toBe(PredictionStatus.COMMITTED);
      expect(commitment.predictedOutcome).toBeNull(); // Not revealed yet
      expect(commitment.encryptedSalt).toBeDefined();

      // Step 2: Reveal prediction
      const revealed = await predictionService.revealPrediction(
        testUser.id,
        commitment.id,
        testMarket.id
      );

      expect(revealed.status).toBe(PredictionStatus.REVEALED);
      expect(revealed.predictedOutcome).toBe(1); // Now revealed
      expect(revealed.encryptedSalt).toBeNull(); // Cleared after reveal
      expect(revealed.revealedAt).toBeDefined();

      // Verify both transaction hashes are stored
      expect(commitment.transactionHash).toBeDefined();
      expect(revealed.revealTxHash).toBeDefined();
      expect(commitment.transactionHash).not.toBe(revealed.revealTxHash);
    });

    it('should handle multiple users committing to same market', async () => {
      const user2 = await prisma.user.create({
        data: {
          email: 'user2@example.com',
          username: 'user2',
          passwordHash: 'hashedpassword',
          usdcBalance: 10000,
        },
      });

      // User 1 commits YES
      const commit1 = await predictionService.commitPrediction(
        testUser.id,
        testMarket.id,
        1,
        100
      );

      // User 2 commits NO
      const commit2 = await predictionService.commitPrediction(
        user2.id,
        testMarket.id,
        0,
        150
      );

      expect(commit1.commitmentHash).not.toBe(commit2.commitmentHash);
      expect(commit1.encryptedSalt).not.toBe(commit2.encryptedSalt);

      // Both can reveal
      const reveal1 = await predictionService.revealPrediction(
        testUser.id,
        commit1.id,
        testMarket.id
      );
      const reveal2 = await predictionService.revealPrediction(
        user2.id,
        commit2.id,
        testMarket.id
      );

      expect(reveal1.predictedOutcome).toBe(1);
      expect(reveal2.predictedOutcome).toBe(0);
    });
  });
});
