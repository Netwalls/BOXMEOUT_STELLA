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
  marketBlockchainService,
  MarketBlockchainService,
} from './blockchain/market.js';

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
    return await executeTransaction(async (tx) => {
      const predictionRepo = new PredictionRepository(tx);
      const userRepo = new UserRepository(tx);

      await predictionRepo.claimWinnings(predictionId);

      const user = await userRepo.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      await userRepo.updateBalance(userId, Number(user.usdcBalance) + winnings);

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
