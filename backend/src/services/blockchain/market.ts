// backend/src/services/blockchain/market.ts
// Market contract interaction service

import {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import { BaseBlockchainService } from './base.js';
import { logger } from '../../utils/logger.js';

export interface MarketActionResult {
  txHash: string;
}

export class MarketBlockchainService extends BaseBlockchainService {
  constructor() {
    super('MarketBlockchainService');
  }

  /**
   * Resolve a market on the blockchain
   * @param marketContractAddress - The contract address of the market
   * @returns Transaction hash
   */
  async resolveMarket(
    marketContractAddress: string
  ): Promise<MarketActionResult> {
    if (!this.adminKeypair) {
      throw new Error(
        'ADMIN_WALLET_SECRET not configured - cannot sign transactions'
      );
    }
    try {
      const contract = new Contract(marketContractAddress);
      const sourceAccount = await this.rpcServer.getAccount(
        this.adminKeypair.publicKey()
      );

      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(contract.call('resolve_market'))
        .setTimeout(30)
        .build();

      const preparedTransaction =
        await this.rpcServer.prepareTransaction(builtTransaction);
      preparedTransaction.sign(this.adminKeypair);

      const response =
        await this.rpcServer.sendTransaction(preparedTransaction);

      if (response.status === 'PENDING') {
        const txHash = response.hash;
        // Use unified retry logic from BaseBlockchainService
        await this.waitForTransaction(txHash, 'resolveMarket', {
          marketContractAddress,
        });
        return { txHash };
      } else {
        throw new Error(`Transaction failed: ${response.status}`);
      }
    } catch (error) {
      logger.error('Market.resolve_market() error', { error });
      throw new Error(
        `Failed to resolve market on blockchain: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Claim winnings for a user
   */
  async claimWinnings(
    marketContractAddress: string,
    userPublicKey: string
  ): Promise<MarketActionResult> {
    if (!this.adminKeypair) {
      throw new Error(
        'ADMIN_WALLET_SECRET not configured - cannot sign transactions'
      );
    }
    try {
      const contract = new Contract(marketContractAddress);
      const sourceAccount = await this.rpcServer.getAccount(
        this.adminKeypair.publicKey()
      );

      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          contract.call(
            'claim_winnings',
            nativeToScVal(userPublicKey, { type: 'address' })
          )
        )
        .setTimeout(30)
        .build();

      const preparedTransaction =
        await this.rpcServer.prepareTransaction(builtTransaction);
      preparedTransaction.sign(this.adminKeypair);

      const response =
        await this.rpcServer.sendTransaction(preparedTransaction);

      if (response.status === 'PENDING') {
        const txHash = response.hash;
        // Use unified retry logic from BaseBlockchainService
        await this.waitForTransaction(txHash, 'claimWinnings', {
          marketContractAddress,
          userPublicKey,
        });
        return { txHash };
      } else {
        throw new Error(`Transaction failed: ${response.status}`);
      }
    } catch (error) {
      logger.error('Market.claim_winnings() error', { error });
      throw new Error(
        `Failed to claim winnings on blockchain: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Commit a prediction on the blockchain
   */
  async commitPrediction(
    marketContractAddress: string,
    commitmentHash: string,
    amountUsdc: number
  ): Promise<MarketActionResult> {
    // TODO: Implement actual Stellar contract call
    logger.info('Blockchain: commiting prediction', {
      marketContractAddress,
      commitmentHash,
      amountUsdc,
    });
    return { txHash: 'mock-commit-tx-' + Date.now() };
  }

  /**
   * Reveal a prediction on the blockchain
   */
  async revealPrediction(
    marketContractAddress: string,
    predictedOutcome: number,
    salt: string
  ): Promise<MarketActionResult> {
    // TODO: Implement actual Stellar contract call
    logger.info('Blockchain: revealing prediction', {
      marketContractAddress,
      predictedOutcome,
    });
    return { txHash: 'mock-reveal-tx-' + Date.now() };
  }
}

export const marketBlockchainService = new MarketBlockchainService();
