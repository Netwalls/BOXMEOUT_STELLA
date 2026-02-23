// backend/src/services/blockchain/factory.ts
// Factory contract interaction service

import {
  Contract,
  rpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Keypair,
  nativeToScVal,
  scValToNative,
  xdr,
  Address,
} from '@stellar/stellar-sdk';
import { logger } from '../../utils/logger.js';

interface CreateMarketParams {
  title: string;
  description: string;
  category: string;
  closingTime: Date;
  resolutionTime: Date;
  creator: string; // Stellar public key
}

interface CreateMarketResult {
  marketId: string;
  txHash: string;
  contractAddress: string;
}

export class FactoryService {
  private readonly rpcServer: rpc.Server;
  private readonly factoryContractId: string;
  private readonly networkPassphrase: string;
  private readonly adminKeypair?: Keypair; // Optional - only needed for write operations

  constructor() {
    const rpcUrl =
      process.env.STELLAR_SOROBAN_RPC_URL ||
      'https://soroban-testnet.stellar.org';
    const network = process.env.STELLAR_NETWORK || 'testnet';

    this.rpcServer = new rpc.Server(rpcUrl, {
      allowHttp: rpcUrl.includes('localhost'),
    });

    this.factoryContractId = process.env.FACTORY_CONTRACT_ADDRESS || '';
    this.networkPassphrase =
      network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

    // Admin keypair is optional - only needed for contract write operations
    const adminSecret = process.env.ADMIN_WALLET_SECRET;

    // Try to load from secret if provided
    if (adminSecret) {
      try {
        this.adminKeypair = Keypair.fromSecret(adminSecret);
      } catch (error) {
        logger.warn(
          'Invalid ADMIN_WALLET_SECRET provided, contract writes will fail'
        );
      }
    }

    // If not loaded (or invalid), handle dev fallback
    if (!this.adminKeypair) {
      // In development/testnet, generate a random keypair if not provided (prevents startup crash)
      if (process.env.NODE_ENV !== 'production') {
        if (!adminSecret) {
          console.warn(
            'ADMIN_WALLET_SECRET not configured, using random keypair for development (Warning: No funds)'
          );
        }
        this.adminKeypair = Keypair.random();
      } else {
        if (!adminSecret) {
          // In PROD, if secret missing, throw or just warn? HEAD threw error.
          throw new Error('ADMIN_WALLET_SECRET not configured');
        }
        // If secret was present but invalid (meaning this.adminKeypair is undefined), we might just leave it undefined and fail later?
        // But HEAD logic threw if !adminSecret.
        // I'll leave it as is: if !adminKeypair and we are here, it means either !adminSecret (handled above) or invalid.
        // If invalid, we already warned.
      }
    }
  }

  /**
   * Call Factory.create_market() contract function
   */
  async createMarket(params: CreateMarketParams): Promise<CreateMarketResult> {
    if (!this.factoryContractId) {
      throw new Error('Factory contract address not configured');
    }

    if (!this.adminKeypair) {
      throw new Error(
        'ADMIN_WALLET_SECRET not configured - cannot sign transactions'
      );
    }

    try {
      // Convert timestamps to Unix time (seconds)
      const closingTimeUnix = Math.floor(params.closingTime.getTime() / 1000);
      const resolutionTimeUnix = Math.floor(
        params.resolutionTime.getTime() / 1000
      );

      const contract = new Contract(this.factoryContractId);

      // Get source account
      const sourceAccount = await this.rpcServer.getAccount(
        this.adminKeypair.publicKey()
      );

      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          contract.call(
            'create_market',
            new Address(params.creator).toScVal(),
            nativeToScVal(params.title, { type: 'string' }),
            nativeToScVal(params.description, { type: 'string' }),
            nativeToScVal(params.category, { type: 'string' }),
            nativeToScVal(closingTimeUnix, { type: 'u64' }),
            nativeToScVal(resolutionTimeUnix, { type: 'u64' })
          )
        )
        .setTimeout(30)
        .build();

      // Prepare transaction for the network
      const preparedTransaction =
        await this.rpcServer.prepareTransaction(builtTransaction);

      // Sign transaction
      preparedTransaction.sign(this.adminKeypair);

      // Submit transaction
      const response =
        await this.rpcServer.sendTransaction(preparedTransaction);

      if (response.status === 'PENDING') {
        // Wait for transaction confirmation
        const txHash = response.hash;
        const result = await this.waitForTransaction(txHash);

        if (result.status === 'SUCCESS') {
          // Extract market_id from contract return value
          const returnValue = result.returnValue;
          const marketId = this.extractMarketId(returnValue);

          return {
            marketId,
            txHash,
            contractAddress: this.factoryContractId,
          };
        } else {
          throw new Error(`Transaction failed: ${result.status}`);
        }
      } else if (response.status === 'ERROR') {
        throw new Error(
          `Transaction submission error: ${response.errorResult}`
        );
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error) {
      logger.error('Factory.create_market() error', { error });
      throw new Error(
        `Failed to create market: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Wait for a transaction to reach finality
   */
  private async waitForTransaction(
    txHash: string,
    maxRetries: number = 10
  ): Promise<any> {
    let retries = 0;

    while (retries < maxRetries) {
      try {
        const txResponse = await this.rpcServer.getTransaction(txHash);

        if (txResponse.status === 'NOT_FOUND') {
          // Transaction not yet processed, wait and retry
          await this.sleep(2000);
          retries++;
          continue;
        }

        if (txResponse.status === 'SUCCESS') {
          return txResponse;
        }

        if (txResponse.status === 'FAILED') {
          throw new Error('Transaction failed on blockchain');
        }

        // Other status, wait and retry
        await this.sleep(2000);
        retries++;
      } catch (error) {
        if (retries >= maxRetries - 1) {
          throw error;
        }
        await this.sleep(2000);
        retries++;
      }
    }

    throw new Error('Transaction confirmation timeout');
  }

  /**
   * Extract BytesN<32> market_id from return value
   */
  private extractMarketId(returnValue: xdr.ScVal | undefined): string {
    try {
      if (!returnValue) {
        throw new Error('No return value from contract');
      }

      // The contract returns BytesN<32>, convert to hex string
      const bytes = scValToNative(returnValue);

      if (bytes instanceof Buffer) {
        return bytes.toString('hex');
      } else if (typeof bytes === 'string') {
        return bytes;
      } else {
        throw new Error('Unexpected return value type');
      }
    } catch (error) {
      logger.error('Error extracting market_id', { error });
      throw new Error('Failed to extract market ID from contract response');
    }
  }

  /**
   * Sleep utility
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Read-only call: get market count
   */
  async getMarketCount(): Promise<number> {
    try {
      if (!this.factoryContractId) {
        return 0;
      }

      const contract = new Contract(this.factoryContractId);

      // For read-only calls, we can use any source account
      // Use admin if available, otherwise use a dummy keypair
      const accountKey =
        this.adminKeypair?.publicKey() || Keypair.random().publicKey();

      let sourceAccount;
      try {
        sourceAccount = await this.rpcServer.getAccount(accountKey);
      } catch (e) {
        // Fallback for simulation
        console.warn(
          'Could not load source account for getMarketCount simulation:',
          e
        );
        // If we don't return 0 here, it will fail below
        return 0;
      }

      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(contract.call('get_market_count'))
        .setTimeout(30)
        .build();

      const simulationResponse =
        await this.rpcServer.simulateTransaction(builtTransaction);

      if (
        rpc.Api.isSimulationSuccess(simulationResponse) &&
        simulationResponse.result?.retval
      ) {
        return scValToNative(simulationResponse.result.retval) as number;
      }

      throw new Error('Failed to get market count');
    } catch (error) {
      logger.error('getMarketCount error', { error });
      return 0;
    }
  }
}

// Singleton instance
export const factoryService = new FactoryService();
