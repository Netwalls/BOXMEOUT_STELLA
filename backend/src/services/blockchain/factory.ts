// backend/src/services/blockchain/factory.ts
// Factory contract interaction service

import {
  Contract,
  rpc,
  TransactionBuilder,
  BASE_FEE,
  Keypair,
  nativeToScVal,
  scValToNative,
  xdr,
  Address,
} from '@stellar/stellar-sdk';
import { BaseBlockchainService } from './base.js';
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

export class FactoryService extends BaseBlockchainService {
  private readonly factoryContractId: string;

  constructor() {
    super('FactoryService');
    this.factoryContractId = process.env.FACTORY_CONTRACT_ADDRESS || '';
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
      const closingTimeUnix = Math.floor(params.closingTime.getTime() / 1000);
      const resolutionTimeUnix = Math.floor(
        params.resolutionTime.getTime() / 1000
      );

      const contract = new Contract(this.factoryContractId);
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

      const preparedTransaction =
        await this.rpcServer.prepareTransaction(builtTransaction);

      preparedTransaction.sign(this.adminKeypair);

      const response =
        await this.rpcServer.sendTransaction(preparedTransaction);

      if (response.status === 'PENDING') {
        const txHash = response.hash;
        // Use unified retry logic from BaseBlockchainService
        const result = await this.waitForTransaction(
          txHash,
          'createMarket',
          params
        );

        if (result.status === 'SUCCESS') {
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
   * Extract BytesN<32> market_id from return value
   */
  private extractMarketId(returnValue: xdr.ScVal | undefined): string {
    try {
      if (!returnValue) {
        throw new Error('No return value from contract');
      }

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
   * Call Factory.deactivate_market()
   */
  async deactivateMarket(
    marketContractAddress: string
  ): Promise<{ txHash: string }> {
    if (!this.factoryContractId) {
      throw new Error('Factory contract address not configured');
    }

    if (!this.adminKeypair) {
      throw new Error(
        'ADMIN_WALLET_SECRET not configured - cannot sign transactions'
      );
    }

    try {
      const contract = new Contract(this.factoryContractId);
      const sourceAccount = await this.rpcServer.getAccount(
        this.adminKeypair.publicKey()
      );

      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          contract.call(
            'deactivate_market',
            new Address(marketContractAddress).toScVal()
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
        const result = await this.waitForTransaction(
          txHash,
          'deactivateMarket',
          { marketContractAddress }
        );

        if (result.status === 'SUCCESS') {
          return { txHash };
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
      logger.error('Factory.deactivate_market() error', { error });
      throw new Error(
        `Failed to deactivate market: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
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
      const accountKey =
        this.adminKeypair?.publicKey() || Keypair.random().publicKey();

      let sourceAccount;
      try {
        sourceAccount = await this.rpcServer.getAccount(accountKey);
      } catch (e) {
        logger.warn(
          'Could not load source account for getMarketCount simulation, using random keypair fallback'
        );
        sourceAccount = await this.rpcServer.getAccount(
          Keypair.random().publicKey()
        );
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

export const factoryService = new FactoryService();
