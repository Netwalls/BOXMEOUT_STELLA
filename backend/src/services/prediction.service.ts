// Prediction service - business logic for predictions
import { PredictionRepository } from '../repositories/prediction.repository.js';
import { MarketRepository } from '../repositories/market.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { MarketStatus, PredictionStatus } from '@prisma/client';
import { executeTransaction } from '../database/transaction.js';
import {
  generateSalt,
  createCommitmentHash,
  encrypt,
  decrypt,
} from '../utils/crypto.js';
import {
  notifyPositionChanged,
  notifyWinningsClaimed,
  notifyBalanceUpdated,
} from '../websocket/realtime.js';
import {
  marketBlockchainService,
  MarketBlockchainService,
} from './blockchain/market.js';
import { leaderboardService } from './leaderboard.service.js';
import { notificationService } from './notification.service.js';
import { logger } from '../utils/logger.js';

export class PredictionService {
  private predictionRepository: PredictionRepository;
  private marketRepository: MarketRepository;
  private userRepository: UserRepository;
  private blockchainService: MarketBlockchainService;

  constructor(
    predictionRepo?: PredictionRepository,
    marketRepo?: MarketRepository,
    userRepo?: UserRepository,
    blockchainSvc?: MarketBlockchainService
  ) {
    this.predictionRepository = predictionRepo || new PredictionRepository();
    this.marketRepository = marketRepo || new MarketRepository();
    this.userRepository = userRepo || new UserRepository();
    this.blockchainService = blockchainSvc || marketBlockchainService;
  }

  /**
   * Commit a prediction with server-generated salt
   * Server generates and stores encrypted salt for reveal phase
   */
  async commitPrediction(
    userId: string,
    marketId: string,
    predictedOutcome: number,
    amountUsdc: number
  ) {
    // Validate market exists and is open
    const market = await this.marketRepository.findById(marketId);
    if (!market) {
      throw new Error('Market not found');
    }

    if (market.status !== MarketStatus.OPEN) {
      throw new Error('Market is not open for predictions');
    }

    if (market.closingAt <= new Date()) {
      throw new Error('Market has closed');
    }

    // Check if user already has a prediction
    const existing = await this.predictionRepository.findByUserAndMarket(
      userId,
      marketId
    );
    if (existing) {
      throw new Error('User already has a prediction for this market');
    }

    // Validate amount
    if (amountUsdc <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    // Validate outcome
    if (![0, 1].includes(predictedOutcome)) {
      throw new Error('Predicted outcome must be 0 (NO) or 1 (YES)');
    }

    // Check user balance
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (Number(user.usdcBalance) < amountUsdc) {
      throw new Error('Insufficient balance');
    }

    // Generate salt and create commitment hash
    const salt = generateSalt();
    const commitmentHash = createCommitmentHash(
      userId,
      marketId,
      predictedOutcome,
      salt
    );

    // Encrypt salt for secure storage
    const { encrypted: encryptedSalt, iv: saltIv } = encrypt(salt);

    // Call blockchain contract - Market.commit_prediction()
    const { txHash } = await this.blockchainService.commitPrediction(
      market.contractAddress,
      commitmentHash,
      amountUsdc
    );

    // Create prediction and update balances in transaction
    return await executeTransaction(async (tx) => {
      const predictionRepo = new PredictionRepository(tx);
      const userRepo = new UserRepository(tx);
      const marketRepo = new MarketRepository(tx);

      // Create prediction with encrypted salt
      const prediction = await predictionRepo.createPrediction({
        userId,
        marketId,
        commitmentHash,
        encryptedSalt,
        saltIv,
        amountUsdc,
        transactionHash: txHash,
        status: PredictionStatus.COMMITTED,
      });

      // Deduct from user balance
      await userRepo.updateBalance(
        userId,
        Number(user.usdcBalance) - amountUsdc
      );

      // Update market volume
      await marketRepo.updateMarketVolume(marketId, amountUsdc, true);

      return prediction;
    }).then((prediction) => {
      // Fire-and-forget portfolio updates (non-blocking)
      notifyPositionChanged(userId, {
        marketId,
        marketTitle: market.title,
        outcome: predictedOutcome,
        amountUsdc,
        status: PredictionStatus.COMMITTED,
      });
      notifyBalanceUpdated(userId, {
        usdcBalance: Number(user.usdcBalance) - amountUsdc,
        reason: 'prediction',
        amountDelta: -amountUsdc,
      });
      return prediction;
    });
  }

  /**
   * Reveal a prediction using server-stored encrypted salt
   * Server decrypts salt and calls blockchain with prediction + salt
   */
  async revealPrediction(
    userId: string,
    predictionId: string,
    marketId: string
  ) {
    const prediction = await this.predictionRepository.findById(predictionId);
    if (!prediction) {
      throw new Error('Prediction not found');
    }

    if (prediction.userId !== userId) {
      throw new Error('Unauthorized');
    }

    if (prediction.marketId !== marketId) {
      throw new Error('Market ID mismatch');
    }

    if (prediction.status !== PredictionStatus.COMMITTED) {
      throw new Error('Prediction already revealed or invalid status');
    }

    // Check encrypted salt exists
    if (!prediction.encryptedSalt || !prediction.saltIv) {
      throw new Error('Salt not found - cannot reveal prediction');
    }

    // Check market is still open for reveals
    const market = await this.marketRepository.findById(prediction.marketId);
    if (!market) {
      throw new Error('Market not found');
    }

    if (market.closingAt <= new Date()) {
      throw new Error('Reveal period has ended');
    }

    // Decrypt the stored salt
    const salt = decrypt(prediction.encryptedSalt, prediction.saltIv);

    // Call blockchain contract - Market.reveal_prediction()
    // We reveal ONLY after finding the correct outcome below
    // (Actually the reveal call on chain needs the outcome and salt)
    // First, calculate the original predicted outcome from commitment hash
    // We need to try both outcomes to verify which one matches
    let predictedOutcome: number | null = null;
    for (const outcome of [0, 1]) {
      const testHash = createCommitmentHash(userId, marketId, outcome, salt);
      if (testHash === prediction.commitmentHash) {
        predictedOutcome = outcome;
        break;
      }
    }

    if (predictedOutcome === null) {
      throw new Error(
        'Invalid commitment hash - cannot determine predicted outcome'
      );
    }

    const { txHash: revealTxHash } =
      await this.blockchainService.revealPrediction(
        market.contractAddress,
        predictedOutcome,
        salt
      );

    // Update prediction to revealed status
    return await this.predictionRepository.revealPrediction(
      predictionId,
      predictedOutcome,
      revealTxHash
    );
  }

  async claimWinnings(userId: string, predictionId: string) {
    const prediction = await this.predictionRepository.findById(predictionId);
    if (!prediction) {
      throw new Error('Prediction not found');
    }

    if (prediction.userId !== userId) {
      throw new Error('Unauthorized');
    }

    if (prediction.status !== PredictionStatus.SETTLED) {
      throw new Error('Prediction not settled');
    }

    if (!prediction.isWinner) {
      throw new Error('Prediction did not win');
    }

    if (prediction.winningsClaimed) {
      throw new Error('Winnings already claimed');
    }

    const winnings = Number(prediction.pnlUsd);
    if (winnings <= 0) {
      throw new Error('No winnings to claim');
    }

    // Update prediction and user balance in transaction
    const result = await executeTransaction(async (tx) => {
      const predictionRepo = new PredictionRepository(tx);
      const userRepo = new UserRepository(tx);

      await predictionRepo.claimWinnings(predictionId);

      const user = await userRepo.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      await userRepo.updateBalance(userId, Number(user.usdcBalance) + winnings);

      return { winnings, newBalance: Number(user.usdcBalance) + winnings };
    });

    // Portfolio: notify winnings claimed
    notifyWinningsClaimed(userId, {
      predictionId,
      marketTitle: (prediction as any).market?.title ?? 'Unknown market',
      winningsUsdc: winnings,
      newBalance: result.newBalance,
    });
    notifyBalanceUpdated(userId, {
      usdcBalance: result.newBalance,
      reason: 'winnings',
      amountDelta: winnings,
    });

    return result;
  }

  async getUserPredictions(
    userId: string,
    options?: {
      status?: PredictionStatus;
      skip?: number;
      take?: number;
    }
  ) {
    return await this.predictionRepository.findUserPredictions(userId, options);
  }

  async getMarketPredictions(marketId: string) {
    return await this.predictionRepository.findMarketPredictions(marketId);
  }

  async getUnclaimedWinnings(userId: string) {
    return await this.predictionRepository.getUnclaimedWinnings(userId);
  }

  async getUserPredictionStats(userId: string) {
    return await this.predictionRepository.getUserPredictionStats(userId);
  }

  async getMarketPredictionStats(marketId: string) {
    return await this.predictionRepository.getMarketPredictionStats(marketId);
  }

  /**
   * Settle all predictions for a resolved market (issue #20).
   * Triggered by market resolution (cron or webhook).
   * - Compares each prediction's outcomeId with winningOutcomeId
   * - Marks won/lost and calculates accuracy points (pnlUsd)
   * - Updates leaderboard via leaderboard.service.ts
   * - Sends notification via notification.service.ts
   */
  async settleMarketPredictions(
    marketId: string,
    winningOutcomeId: number
  ): Promise<{ settled: number; skipped: number }> {
    const market = await this.marketRepository.findById(marketId);
    if (!market) throw new Error('Market not found');

    if (market.status !== 'RESOLVED' as any) {
      throw new Error('Market must be RESOLVED before settling predictions');
    }

    const predictions = await this.predictionRepository.findMarketPredictions(marketId);
    const unsettled = predictions.filter((p) => p.status !== PredictionStatus.SETTLED);

    if (unsettled.length === 0) {
      logger.info('settleMarketPredictions: no unsettled predictions', { marketId });
      return { settled: 0, skipped: 0 };
    }

    // Settle all in one transaction
    await executeTransaction(async (tx) => {
      const predRepo = new PredictionRepository(tx);
      for (const prediction of unsettled) {
        const isWinner = prediction.predictedOutcome === winningOutcomeId;
        const pnlUsd = isWinner
          ? Number(prediction.amountUsdc) * 0.9   // 90% return (10% fee)
          : -Number(prediction.amountUsdc);
        await predRepo.settlePrediction(prediction.id, isWinner, pnlUsd);
      }
    });

    logger.info('settleMarketPredictions: DB settlement complete', {
      marketId,
      count: unsettled.length,
    });

    // Group by user for leaderboard + notification (one call per user)
    const byUser = new Map<string, { pnlUsd: number; isWinner: boolean }>();
    for (const prediction of unsettled) {
      const isWinner = prediction.predictedOutcome === winningOutcomeId;
      const pnlUsd = isWinner
        ? Number(prediction.amountUsdc) * 0.9
        : -Number(prediction.amountUsdc);

      const existing = byUser.get(prediction.userId);
      if (existing) {
        existing.pnlUsd += pnlUsd;
        existing.isWinner = existing.isWinner || isWinner;
      } else {
        byUser.set(prediction.userId, { pnlUsd, isWinner });
      }
    }

    const winningLabel = winningOutcomeId === 1 ? market.outcomeA : market.outcomeB;

    for (const [userId, { pnlUsd, isWinner }] of byUser) {
      // Update leaderboard score
      await leaderboardService.awardAccuracyPoints(
        userId,
        marketId,
        market.category,
        isWinner,
        pnlUsd
      );

      // Send prediction result notification (fire-and-forget)
      notificationService
        .notifyPredictionResult(userId, market.title, isWinner, pnlUsd)
        .catch((err) =>
          logger.error('Failed to send prediction result notification', { userId, marketId, err })
        );

      // Notify winners that winnings are available
      if (isWinner) {
        notificationService
          .notifyWinningsAvailable(userId, market.title, pnlUsd)
          .catch((err) =>
            logger.error('Failed to send winnings available notification', { userId, marketId, err })
          );
      }
    }

    // Recalculate global ranks after all users are updated
    await leaderboardService.calculateRanks();

    logger.info('settleMarketPredictions: complete', {
      marketId,
      settled: unsettled.length,
      winningOutcomeId,
      winningLabel,
    });

    return { settled: unsettled.length, skipped: predictions.length - unsettled.length };
  }
}
