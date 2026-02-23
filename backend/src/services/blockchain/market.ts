import {
  Contract,
  rpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Keypair,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import { logger } from '../../utils/logger.js';

export interface MarketActionResult {
  txHash: string;
}

export class MarketBlockchainService {
  private rpcServer: rpc.Server;
  private networkPassphrase: string;
  private adminKeypair?: Keypair;

  constructor() {
    const rpcUrl =
      process.env.STELLAR_SOROBAN_RPC_URL ||
      'https://soroban-testnet.stellar.org';
    const network = process.env.STELLAR_NETWORK || 'testnet';

    this.rpcServer = new rpc.Server(rpcUrl, {
      allowHttp: rpcUrl.includes('localhost'),
    });
    this.networkPassphrase =
      network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

    const adminSecret = process.env.ADMIN_WALLET_SECRET;
    if (adminSecret) {
      try {
        this.adminKeypair = Keypair.fromSecret(adminSecret);
      } catch (error) {
        logger.warn('Invalid ADMIN_WALLET_SECRET for Market service');
      }
    }
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
        await this.waitForTransaction(txHash);
        return { txHash };
      } else {
        throw new Error(`Transaction failed: ${response.status}`);
      }
    } catch (error) {
      logger.error('Market.resolve_market() error', { error });
      throw new Error(
        `Failed to resolve market on blockchain: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Claim winnings for a user (called by the user backend on their behalf or signed by user)
   * Acceptance criteria says: Call Market.claim_winnings()
   * Usually this is signed by the user, but if the backend is an intermediary/custodial:
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
        await this.waitForTransaction(txHash);
        return { txHash };
      } else {
        throw new Error(`Transaction failed: ${response.status}`);
      }
    } catch (error) {
      logger.error('Market.claim_winnings() error', { error });
      throw new Error(
        `Failed to claim winnings on blockchain: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }
  /**
   * Get the current state of a market (read-only query)
   * @param marketContractAddress - The contract address of the market
   * @returns Market state data
   */
  async getMarketState(marketContractAddress: string): Promise<any> {
    try {
      const contract = new Contract(marketContractAddress);

      // For read-only queries, we don't need to sign or submit a transaction
      // We can simulate the call to get the result
      const sourceAccount = await this.rpcServer.getAccount(
        this.adminKeypair?.publicKey() || Keypair.random().publicKey()
      );

      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(contract.call('get_market_state'))
        .setTimeout(30)
        .build();

      const simulationResponse =
        await this.rpcServer.simulateTransaction(builtTransaction);

      if (
        simulationResponse.results &&
        simulationResponse.results.length > 0
      ) {
        const result = simulationResponse.results[0];
        return result.retval;
      } else {
        throw new Error('No result returned from simulation');
      }
    } catch (error) {
      logger.error('Market.get_market_state() error', { error });
      throw new Error(
        `Failed to get market state from blockchain: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Commit a prediction on the blockchain
   * @param marketContractAddress - The contract address of the market
   * @param userPublicKey - The user's public key
   * @param commitmentHash - The hash of the prediction commitment
   * @returns Transaction hash
   */
  async commitPrediction(
    marketContractAddress: string,
    userPublicKey: string,
    commitmentHash: string
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
            'commit',
            nativeToScVal(userPublicKey, { type: 'address' }),
            nativeToScVal(commitmentHash, { type: 'bytes' })
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
        await this.waitForTransaction(txHash);
        return { txHash };
      } else {
        throw new Error(`Transaction failed: ${response.status}`);
      }
    } catch (error) {
      logger.error('Market.commit() error', { error });
      throw new Error(
        `Failed to commit prediction on blockchain: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Reveal a prediction on the blockchain
   * @param marketContractAddress - The contract address of the market
   * @param userPublicKey - The user's public key
   * @param prediction - The actual prediction value
   * @param salt - The salt used in the commitment
   * @returns Transaction hash
   */
  async revealPrediction(
    marketContractAddress: string,
    userPublicKey: string,
    prediction: string,
    salt: string
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
            'reveal',
            nativeToScVal(userPublicKey, { type: 'address' }),
            nativeToScVal(prediction, { type: 'string' }),
            nativeToScVal(salt, { type: 'bytes' })
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
        await this.waitForTransaction(txHash);
        return { txHash };
      } else {
        throw new Error(`Transaction failed: ${response.status}`);
      }
    } catch (error) {
      logger.error('Market.reveal() error', { error });
      throw new Error(
        `Failed to reveal prediction on blockchain: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }


  private async waitForTransaction(
    txHash: string,
    maxRetries: number = 10
  ): Promise<any> {
    let retries = 0;
    while (retries < maxRetries) {
      try {
        const txResponse = await this.rpcServer.getTransaction(txHash);
        if (txResponse.status === 'SUCCESS') return txResponse;
        if (txResponse.status === 'FAILED')
          throw new Error('Transaction failed');
        await new Promise((r) => setTimeout(r, 2000));
        retries++;
      } catch (error) {
        if (retries >= maxRetries - 1) throw error;
        await new Promise((r) => setTimeout(r, 2000));
        retries++;
      }
    }
    throw new Error('Transaction timeout');
  }
}

export const marketBlockchainService = new MarketBlockchainService();
