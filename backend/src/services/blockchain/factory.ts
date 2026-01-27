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
  private readonly adminKeypair: Keypair;

  constructor() {
    const rpcUrl =
      process.env.STELLAR_SOROBAN_RPC_URL ??
      'https://soroban-testnet.stellar.org';

    const network = process.env.STELLAR_NETWORK ?? 'testnet';

    this.rpcServer = new rpc.Server(rpcUrl, {
      allowHttp: rpcUrl.includes('localhost'),
    });

    this.factoryContractId =
      process.env.FACTORY_CONTRACT_ADDRESS ?? '';

    this.networkPassphrase =
      network === 'mainnet'
        ? Networks.PUBLIC
        : Networks.TESTNET;

    const adminSecret = process.env.ADMIN_WALLET_SECRET;
    if (!adminSecret) {
      throw new Error('ADMIN_WALLET_SECRET not configured');
    }

    this.adminKeypair = Keypair.fromSecret(adminSecret);
  }

  /**
   * Call Factory.create_market() contract function
   */
  async createMarket(
    params: CreateMarketParams,
  ): Promise<CreateMarketResult> {
    if (!this.factoryContractId) {
      throw new Error('Factory contract address not configured');
    }

    try {
      const closingTimeUnix = Math.floor(
        params.closingTime.getTime() / 1000,
      );

      const resolutionTimeUnix = Math.floor(
        params.resolutionTime.getTime() / 1000,
      );

      const contract = new Contract(this.factoryContractId);
      const sourceAccount = await this.rpcServer.getAccount(
        this.adminKeypair.publicKey(),
      );

      const tx = new TransactionBuilder(sourceAccount, {
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
            nativeToScVal(resolutionTimeUnix, { type: 'u64' }),
          ),
        )
        .setTimeout(30)
        .build();

      const preparedTx =
        await this.rpcServer.prepareTransaction(tx);

      preparedTx.sign(this.adminKeypair);

      const sendResponse =
        await this.rpcServer.sendTransaction(preparedTx);

      if (sendResponse.status !== 'PENDING') {
        throw new Error(
          `Transaction submission failed: ${sendResponse.status}`,
        );
      }

      const txResult = await this.waitForTransaction(
        sendResponse.hash,
      );

      if (txResult.status !== 'SUCCESS') {
        throw new Error('Transaction execution failed');
      }

      const marketId = this.extractMarketId(
        txResult.returnValue,
      );

      return {
        marketId,
        txHash: sendResponse.hash,
        contractAddress: this.factoryContractId,
      };
    } catch (error) {
      console.error(
        'Factory.create_market() error:',
        error,
      );
      throw new Error(
        `Failed to create market: ${
          error instanceof Error
            ? error.message
            : 'Unknown error'
        }`,
      );
    }
  }

  /**
   * Wait for a transaction to reach finality
   */
  private async waitForTransaction(
    txHash: string,
    maxRetries = 10,
  ) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const tx = await this.rpcServer.getTransaction(txHash);

      if (tx.status === 'SUCCESS') {
        return tx;
      }

      if (tx.status === 'FAILED') {
        throw new Error('Transaction failed on-chain');
      }

      await this.sleep(2000);
    }

    throw new Error('Transaction confirmation timeout');
  }

  /**
   * Extract BytesN<32> market_id from return value
   */
  private extractMarketId(
    returnValue: xdr.ScVal | undefined,
  ): string {
    if (!returnValue) {
      throw new Error('No return value from contract');
    }

    const native = scValToNative(returnValue);

    if (native instanceof Buffer) {
      return native.toString('hex');
    }

    if (typeof native === 'string') {
      return native;
    }

    throw new Error('Unexpected return value type');
  }

  /**
   * Read-only call: get market count
   */
  async getMarketCount(): Promise<number> {
    try {
      const contract = new Contract(this.factoryContractId);
      const sourceAccount = await this.rpcServer.getAccount(
        this.adminKeypair.publicKey(),
      );

      const tx = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(contract.call('get_market_count'))
        .setTimeout(30)
        .build();

      const simulation =
        await this.rpcServer.simulateTransaction(tx);

      if (this.isSimulationSuccess(simulation)) {
        return scValToNative(
          simulation.result.retval,
        ) as number;
      }

      throw new Error('Simulation failed');
    } catch (error) {
      console.error('getMarketCount error:', error);
      return 0;
    }
  }

  /**
   * Type guard for successful simulation
   */
  private isSimulationSuccess(
    response: any,
  ): response is { result: any } {
    return 'result' in response;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const factoryService = new FactoryService();
