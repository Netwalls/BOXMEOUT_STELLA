// backend/src/services/blockchain/amm.ts
// AMM (Automated Market Maker) contract interaction service

import {
  Contract,
  rpc as SorobanRpc,
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Keypair,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

interface BuySharesParams {
  marketId: string;
  outcome: number; // 0 or 1
  amountUsdc: number;
  minShares: number;
}

interface BuySharesResult {
  sharesReceived: number;
  pricePerUnit: number;
  totalCost: number;
  feeAmount: number;
  txHash: string;
}

interface SellSharesParams {
  marketId: string;
  outcome: number; // 0 or 1
  shares: number;
  minPayout: number;
}

interface SellSharesResult {
  payout: number;
  pricePerUnit: number;
  feeAmount: number;
  txHash: string;
}

interface MarketOdds {
  yesOdds: number; // e.g., 0.65 (65%)
  noOdds: number; // e.g., 0.35 (35%)
  yesPercentage: number; // e.g., 65
  noPercentage: number; // e.g., 35
  yesLiquidity: number;
  noLiquidity: number;
  totalLiquidity: number;
}

export class AMMService {
interface CreatePoolParams {
  marketId: string; // on-chain market id/address/bytes
  initialLiquidity: bigint; // in smallest units
}

interface CreatePoolResult {
  txHash: string;
  reserves: { yes: bigint; no: bigint };
  odds: { yes: number; no: number };
}

export class AmmService {
  private rpcServer: SorobanRpc.Server;
  private ammContractId: string;
  private networkPassphrase: string;
  private adminKeypair: Keypair;

  constructor() {
    const rpcUrl = process.env.STELLAR_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
    const network = process.env.STELLAR_NETWORK || 'testnet';

    this.rpcServer = new SorobanRpc.Server(rpcUrl, { allowHttp: rpcUrl.includes('localhost') });
    this.ammContractId = process.env.AMM_CONTRACT_ADDRESS || '';
    this.networkPassphrase = network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

    // Admin keypair for signing contract calls
    const adminSecret = process.env.ADMIN_WALLET_SECRET;
    if (!adminSecret) {
      // In development/testnet, generate a random keypair if not provided (prevents startup crash)
      if (process.env.NODE_ENV !== 'production') {
        console.warn('ADMIN_WALLET_SECRET not configured, using random keypair for AMM service (Warning: No funds)');
        this.adminKeypair = Keypair.random();
      } else {
        throw new Error('ADMIN_WALLET_SECRET not configured');
      }
    } else {
      this.adminKeypair = Keypair.fromSecret(adminSecret);
    }
  }

  /**
   * Buy outcome shares from the AMM
   * @param params - Buy parameters
   * @returns Shares received and transaction details
   */
  async buyShares(params: BuySharesParams): Promise<BuySharesResult> {
    const adminSecret = process.env.ADMIN_WALLET_SECRET;
    if (!adminSecret) {
      throw new Error('ADMIN_WALLET_SECRET not configured');
    }
    this.adminKeypair = Keypair.fromSecret(adminSecret);
  }

  /**
   * Call AMM.create_pool(market_id, initial_liquidity)
   */
  async createPool(params: CreatePoolParams): Promise<CreatePoolResult> {
    if (!this.ammContractId) {
      throw new Error('AMM contract address not configured');
    }

    try {
      const contract = new Contract(this.ammContractId);
      const sourceAccount = await this.rpcServer.getAccount(this.adminKeypair.publicKey());

      // Build the contract call operation
      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          contract.call(
            'buy_shares',
            nativeToScVal(params.marketId, { type: 'string' }),
            nativeToScVal(params.outcome, { type: 'u32' }),
            nativeToScVal(params.amountUsdc, { type: 'i128' }),
            nativeToScVal(params.minShares, { type: 'i128' })
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
        const txHash = response.hash;
        const result = await this.waitForTransaction(txHash);

        if (result.status === 'SUCCESS') {
          // Extract result from contract return value
          const returnValue = result.returnValue;
          const buyResult = this.parseBuySharesResult(returnValue);

          return {
            ...buyResult,
            txHash,
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
      console.error('AMM.buy_shares() error:', error);
      throw new Error(
        `Failed to buy shares: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Sell outcome shares to the AMM
   * @param params - Sell parameters
   * @returns Payout received and transaction details
   */
  async sellShares(params: SellSharesParams): Promise<SellSharesResult> {
    if (!this.ammContractId) {
      throw new Error('AMM contract address not configured');
    }

    try {
      const contract = new Contract(this.ammContractId);
      const sourceAccount = await this.rpcServer.getAccount(this.adminKeypair.publicKey());

      // Build the contract call operation
      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          contract.call(
            'sell_shares',
            nativeToScVal(params.marketId, { type: 'string' }),
            nativeToScVal(params.outcome, { type: 'u32' }),
            nativeToScVal(params.shares, { type: 'i128' }),
            nativeToScVal(params.minPayout, { type: 'i128' })
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
        const txHash = response.hash;
        const result = await this.waitForTransaction(txHash);

        if (result.status === 'SUCCESS') {
          // Extract result from contract return value
          const returnValue = result.returnValue;
          const sellResult = this.parseSellSharesResult(returnValue);

          return {
            ...sellResult,
            txHash,
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
      console.error('AMM.sell_shares() error:', error);
      throw new Error(
        `Failed to sell shares: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get current market odds from the AMM
   * @param marketId - Market ID
   * @returns Market odds and liquidity information
   */
  async getOdds(marketId: string): Promise<MarketOdds> {
    if (!this.ammContractId) {
      throw new Error('AMM contract address not configured');
    }

    try {
      const contract = new Contract(this.ammContractId);
      const sourceAccount = await this.rpcServer.getAccount(this.adminKeypair.publicKey());

      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          contract.call(
            'get_odds',
            nativeToScVal(marketId, { type: 'string' })
          )
        )
        .setTimeout(30)
        .build();

      // Simulate transaction to get result without submitting
      const simulationResponse = await this.rpcServer.simulateTransaction(builtTransaction);

      if (SorobanRpc.Api.isSimulationSuccess(simulationResponse)) {
        const result = simulationResponse.result?.retval;
        if (!result) {
          throw new Error('No return value from simulation');
        }
        
        return this.parseOddsResult(result);
      }

      throw new Error('Failed to get market odds');
    } catch (error) {
      console.error('Error getting market odds:', error);
      throw new Error(
        `Failed to get odds: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Wait for transaction to be confirmed
   * @param txHash - Transaction hash
   * @param maxRetries - Maximum number of retries
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
   * Parse buy_shares contract return value
   * @param returnValue - Contract return value
   * @returns Parsed buy result
   */
  private parseBuySharesResult(returnValue: xdr.ScVal | undefined): Omit<BuySharesResult, 'txHash'> {
    if (!returnValue) {
      throw new Error('No return value from contract');
    }

    try {
      // Expected return format: { shares_received, price_per_unit, total_cost, fee_amount }
      const result = scValToNative(returnValue);

      return {
        sharesReceived: Number(result.shares_received || result.sharesReceived || 0),
        pricePerUnit: Number(result.price_per_unit || result.pricePerUnit || 0),
        totalCost: Number(result.total_cost || result.totalCost || 0),
        feeAmount: Number(result.fee_amount || result.feeAmount || 0),
      };
    } catch (error) {
      console.error('Error parsing buy shares result:', error);
      throw new Error('Failed to parse contract response');
    }
  }

  /**
   * Parse sell_shares contract return value
   * @param returnValue - Contract return value
   * @returns Parsed sell result
   */
  private parseSellSharesResult(returnValue: xdr.ScVal | undefined): Omit<SellSharesResult, 'txHash'> {
    if (!returnValue) {
      throw new Error('No return value from contract');
    }

    try {
      // Expected return format: { payout, price_per_unit, fee_amount }
      const result = scValToNative(returnValue);

      return {
        payout: Number(result.payout || 0),
        pricePerUnit: Number(result.price_per_unit || result.pricePerUnit || 0),
        feeAmount: Number(result.fee_amount || result.feeAmount || 0),
      };
    } catch (error) {
      console.error('Error parsing sell shares result:', error);
      throw new Error('Failed to parse contract response');
    }
  }

  /**
   * Parse get_odds contract return value
   * @param returnValue - Contract return value
   * @returns Market odds
   */
  private parseOddsResult(returnValue: xdr.ScVal): MarketOdds {
    try {
      // Expected return format: { yes_odds, no_odds, yes_liquidity, no_liquidity }
      const result = scValToNative(returnValue);

      const yesOdds = Number(result.yes_odds || result.yesOdds || 0.5);
      const noOdds = Number(result.no_odds || result.noOdds || 0.5);
      const yesLiquidity = Number(result.yes_liquidity || result.yesLiquidity || 0);
      const noLiquidity = Number(result.no_liquidity || result.noLiquidity || 0);

      return {
        yesOdds,
        noOdds,
        yesPercentage: Math.round(yesOdds * 100),
        noPercentage: Math.round(noOdds * 100),
        yesLiquidity,
        noLiquidity,
        totalLiquidity: yesLiquidity + noLiquidity,
      };
    } catch (error) {
      console.error('Error parsing odds result:', error);
      throw new Error('Failed to parse odds response');
    }
  }

  /**
   * Sleep utility
   * @param ms - Milliseconds to sleep
   */
    // Build contract call
    const contract = new Contract(this.ammContractId);
    const sourceAccount = await this.rpcServer.getAccount(this.adminKeypair.publicKey());

    const builtTx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        contract.call(
          'create_pool',
          // market id is likely BytesN<32> on-chain; accept hex string here
          nativeToScVal(Buffer.from(params.marketId.replace(/^0x/, ''), 'hex')),
          nativeToScVal(params.initialLiquidity, { type: 'i128' })
        )
      )
      .setTimeout(30)
      .build();

    const prepared = await this.rpcServer.prepareTransaction(builtTx);
    prepared.sign(this.adminKeypair);
    const response = await this.rpcServer.sendTransaction(prepared);

    if (response.status === 'PENDING') {
      const txHash = response.hash;
      const result = await this.waitForTransaction(txHash);
      if (result.status !== 'SUCCESS') {
        throw new Error(`Transaction failed: ${result.status}`);
      }

      // Expect return to include pool state; if not, follow-up simulation call
      const { reserves, odds } = await this.getPoolState(params.marketId);

      return { txHash, reserves, odds };
    }

    if (response.status === 'ERROR') {
      throw new Error(`Transaction submission error: ${response.errorResult}`);
    }

    throw new Error(`Unexpected response status: ${response.status}`);
  }

  async getPoolState(marketId: string): Promise<{ reserves: { yes: bigint; no: bigint }; odds: { yes: number; no: number } }> {
    const contract = new Contract(this.ammContractId);
    const sourceAccount = await this.rpcServer.getAccount(this.adminKeypair.publicKey());

    const builtTx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        contract.call(
          'get_pool',
          nativeToScVal(Buffer.from(marketId.replace(/^0x/, ''), 'hex'))
        )
      )
      .setTimeout(30)
      .build();

    const sim = await this.rpcServer.simulateTransaction(builtTx);
    if (!SorobanRpc.Api.isSimulationSuccess(sim)) {
      throw new Error('Failed to fetch pool state');
    }
    const retval = sim.result?.retval as xdr.ScVal | undefined;
    if (!retval) {
      throw new Error('Empty pool response');
    }

    const native = scValToNative(retval) as any;
    // Expect structure like { r_yes: i128, r_no: i128, odds_yes: i64, odds_no: i64 } or similar
    const reserves = {
      yes: BigInt(native.r_yes ?? native.yes ?? 0n),
      no: BigInt(native.r_no ?? native.no ?? 0n),
    } as { yes: bigint; no: bigint };
    const odds = {
      yes: Number(native.odds_yes ?? native.yes_odds ?? 0.5),
      no: Number(native.odds_no ?? native.no_odds ?? 0.5),
    } as { yes: number; no: number };

    return { reserves, odds };
  }

  private async waitForTransaction(txHash: string, maxRetries: number = 10): Promise<any> {
    let retries = 0;
    while (retries < maxRetries) {
      const tx = await this.rpcServer.getTransaction(txHash);
      if (tx.status === 'SUCCESS') return tx;
      if (tx.status === 'FAILED') throw new Error('Transaction failed on blockchain');
      await this.sleep(2000);
      retries++;
    }
    throw new Error('Transaction confirmation timeout');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const ammService = new AmmService();
