// backend/src/services/blockchain/factory.ts
// Factory contract interaction service

import {
  Contract,
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Keypair,
  nativeToScVal,
  scValToNative,
  xdr,
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
  private rpcServer: SorobanRpc.Server;
  private factoryContractId: string;
  private networkPassphrase: string;
  private adminKeypair: Keypair;

  constructor() {
    const rpcUrl = process.env.STELLAR_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
    const network = process.env.STELLAR_NETWORK || 'testnet';
    
    this.rpcServer = new SorobanRpc.Server(rpcUrl, { allowHttp: rpcUrl.includes('localhost') });
    this.factoryContractId = process.env.FACTORY_CONTRACT_ADDRESS || '';
    this.networkPassphrase = network === 'mainnet' 
      ? Networks.PUBLIC 
      : Networks.TESTNET;
    
    // Admin keypair for signing contract calls
    const adminSecret = process.env.ADMIN_WALLET_SECRET;
    if (!adminSecret) {
      throw new Error('ADMIN_WALLET_SECRET not configured');
    }
    this.adminKeypair = Keypair.fromSecret(adminSecret);
  }

  /**
   * Call Factory.create_market() contract function
   * @param params - Market creation parameters
   * @returns Market ID, transaction hash, and contract address
   */
  async createMarket(params: CreateMarketParams): Promise<CreateMarketResult> {
    if (!this.factoryContractId) {
      throw new Error('Factory contract address not configured');
    }

    try {
      // Convert timestamps to Unix time (seconds)
      const closingTimeUnix = Math.floor(params.closingTime.getTime() / 1000);
      const resolutionTimeUnix = Math.floor(params.resolutionTime.getTime() / 1000);

      // Build contract arguments
      const contract = new Contract(this.factoryContractId);
      
      // Get source account
      const sourceAccount = await this.rpcServer.getAccount(this.adminKeypair.publicKey());

      // Build the contract call operation
      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          contract.call(
            'create_market',
            nativeToScVal(params.creator, { type: 'address' }),
            nativeToScVal(params.title, { type: 'symbol' }),
            nativeToScVal(params.description, { type: 'symbol' }),
            nativeToScVal(params.category, { type: 'symbol' }),
            nativeToScVal(closingTimeUnix, { type: 'u64' }),
            nativeToScVal(resolutionTimeUnix, { type: 'u64' })
          )
        )
        .setTimeout(30)
        .build();

      // Prepare transaction for the network
      const preparedTransaction = await this.rpcServer.prepareTransaction(builtTransaction);

      // Sign transaction
      preparedTransaction.sign(this.adminKeypair);

      // Submit transaction
      const response = await this.rpcServer.sendTransaction(preparedTransaction);

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
        throw new Error(`Transaction submission error: ${response.errorResult}`);
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error) {
      console.error('Factory.create_market() error:', error);
      throw new Error(
        `Failed to create market on blockchain: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Wait for transaction to be confirmed
   * @param txHash - Transaction hash
   * @returns Transaction result
   */
  private async waitForTransaction(txHash: string, maxRetries: number = 10): Promise<any> {
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
   * Extract market_id from contract return value
   * @param returnValue - Contract return value
   * @returns Market ID as hex string
   */
  private extractMarketId(returnValue: xdr.ScVal | undefined): string {
    if (!returnValue) {
      throw new Error('No return value from contract');
    }
    
    try {
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
      console.error('Error extracting market_id:', error);
      throw new Error('Failed to extract market ID from contract response');
    }
  }

  /**
   * Sleep utility
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get market count from factory contract
   * @returns Total number of markets created
   */
  async getMarketCount(): Promise<number> {
    try {
      const contract = new Contract(this.factoryContractId);
      const sourceAccount = await this.rpcServer.getAccount(this.adminKeypair.publicKey());

      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(contract.call('get_market_count'))
        .setTimeout(30)
        .build();

      const simulationResponse = await this.rpcServer.simulateTransaction(builtTransaction);
      
      if (SorobanRpc.Api.isSimulationSuccess(simulationResponse)) {
        const result = simulationResponse.result?.retval;
        return scValToNative(result) as number;
      }
      
      throw new Error('Failed to get market count');
    } catch (error) {
      console.error('Error getting market count:', error);
      return 0;
    }
  }
}

// Singleton instance
export const factoryService = new FactoryService();
