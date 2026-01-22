// Prediction service - business logic for predictions
import { PredictionRepository } from '../repositories/prediction.repository.js';
import { MarketRepository } from '../repositories/market.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { MarketStatus, PredictionStatus } from '@prisma/client';
import { executeTransaction } from '../database/transaction.js';
import crypto from 'crypto';

export class PredictionService {
  private predictionRepository: PredictionRepository;
  private marketRepository: MarketRepository;
  private userRepository: UserRepository;

  constructor() {
    this.predictionRepository = new PredictionRepository();
    this.marketRepository = new MarketRepository();
    this.userRepository = new UserRepository();
  }

  async commitPrediction(
    userId: string,
    marketId: string,
    amountUsdc: number,
    salt: string
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

    // Check user balance
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (Number(user.usdcBalance) < amountUsdc) {
      throw new Error('Insufficient balance');
    }

    // Generate commitment hash (will be verified on reveal)
    const commitmentHash = crypto
      .createHash('sha256')
      .update(`${userId}:${marketId}:${salt}`)
      .digest('hex');

    // Create prediction and update balances in transaction
    return await executeTransaction(async (tx) => {
      const predictionRepo = new PredictionRepository(tx);
      const userRepo = new UserRepository(tx);
      const marketRepo = new MarketRepository(tx);

      // Create prediction
      const prediction = await predictionRepo.createPrediction({
        userId,
        marketId,
        commitmentHash,
        amountUsdc,
      });

      // Deduct from user balance
      await userRepo.updateBalance(
        userId,
        Number(user.usdcBalance) - amountUsdc
      );

      // Update market volume
      await marketRepo.updateMarketVolume(marketId, amountUsdc, true);

      return prediction;
    });
  }

  async revealPrediction(
    userId: string,
    predictionId: string,
    predictedOutcome: number,
    salt: string
  ) {
    const prediction = await this.predictionRepository.findById(predictionId);
    if (!prediction) {
      throw new Error('Prediction not found');
    }

    if (prediction.userId !== userId) {
      throw new Error('Unauthorized');
    }

    if (prediction.status !== PredictionStatus.COMMITTED) {
      throw new Error('Prediction already revealed');
    }

    // Validate outcome
    if (predictedOutcome !== 0 && predictedOutcome !== 1) {
      throw new Error('Outcome must be 0 or 1');
    }

    // Verify commitment hash
    const expectedHash = crypto
      .createHash('sha256')
      .update(`${userId}:${prediction.marketId}:${salt}`)
      .digest('hex');

    if (expectedHash !== prediction.commitmentHash) {
      throw new Error('Invalid salt - commitment hash mismatch');
    }

    // Check market is still open for reveals
    const market = await this.marketRepository.findById(prediction.marketId);
    if (!market) {
      throw new Error('Market not found');
    }

    if (market.closingAt <= new Date()) {
      throw new Error('Reveal period has ended');
    }

    return await this.predictionRepository.revealPrediction(
      predictionId,
      predictedOutcome
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
    return await executeTransaction(async (tx) => {
      const predictionRepo = new PredictionRepository(tx);
      const userRepo = new UserRepository(tx);

      await predictionRepo.claimWinnings(predictionId);

      const user = await userRepo.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      await userRepo.updateBalance(
        userId,
        Number(user.usdcBalance) + winnings
      );

      return { winnings };
    });
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
}
