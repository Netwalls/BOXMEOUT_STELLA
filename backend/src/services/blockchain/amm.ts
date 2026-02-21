// backend/src/services/blockchain/amm.ts
// AMM contract interaction service

import {
  Contract,
  rpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Keypair,
  nativeToScVal,
  scValToNative,
} from '@stellar/stellar-sdk';
import { logger } from '../../utils/logger.js';

interface CreatePoolParams {
  marketId: string; // hex string (BytesN<32>)
  initialLiquidity: bigint;
}

interface CreatePoolResult {
  txHash: string;
  reserves: { yes: bigint; no: bigint };
  odds: { yes: number; no: number };
}

export class AmmService {
  private readonly rpcServer: rpc.Server;
  private readonly ammContractId: string;
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
    this.ammContractId = process.env.AMM_CONTRACT_ADDRESS || '';
    this.networkPassphrase =
      network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

    // Admin keypair is optional - only needed for contract write operations
    const adminSecret = process.env.ADMIN_WALLET_SECRET;
    if (adminSecret) {
      try {
        this.adminKeypair = Keypair.fromSecret(adminSecret);
      } catch (error) {
        logger.warn('Invalid ADMIN_WALLET_SECRET for AMM service');
      }
    }
  }

  /**
   * Call AMM.create_pool(market_id, initial_liquidity)
   */
  async createPool(params: CreatePoolParams): Promise<CreatePoolResult> {
    if (!this.ammContractId) {
      throw new Error('AMM contract address not configured');
    }

    if (!this.adminKeypair) {
      throw new Error(
        'ADMIN_WALLET_SECRET not configured - cannot sign transactions'
      );
    }

    const contract = new Contract(this.ammContractId);
    const sourceAccount = await this.rpcServer.getAccount(
      this.adminKeypair.publicKey()
    );

    const builtTx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        contract.call(
          'create_pool',
          nativeToScVal(Buffer.from(params.marketId.replace(/^0x/, ''), 'hex')),
          nativeToScVal(params.initialLiquidity, { type: 'i128' })
        )
      )
      .setTimeout(30)
      .build();

    const prepared = await this.rpcServer.prepareTransaction(builtTx);
    prepared.sign(this.adminKeypair);

    const sendResponse = await this.rpcServer.sendTransaction(prepared);

    if (sendResponse.status !== 'PENDING') {
      throw new Error(`Transaction submission failed: ${sendResponse.status}`);
    }

    const txResult = await this.waitForTransaction(sendResponse.hash);

    if (txResult.status !== 'SUCCESS') {
      throw new Error('Transaction execution failed');
    }

    const { reserves, odds } = await this.getPoolState(params.marketId);

    return {
      txHash: sendResponse.hash,
      reserves,
      odds,
    };
  }

  /**
   * Read-only call: get pool state
   */
  async getPoolState(marketId: string): Promise<{
    reserves: { yes: bigint; no: bigint };
    odds: { yes: number; no: number };
  }> {
    const contract = new Contract(this.ammContractId);

    // For read-only calls, use admin if available, otherwise use dummy keypair
    const accountKey =
      this.adminKeypair?.publicKey() || Keypair.random().publicKey();
    const sourceAccount = await this.rpcServer.getAccount(accountKey);

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
    if (!rpc.Api.isSimulationSuccess(sim) || !sim.result?.retval) {
      throw new Error('Failed to fetch pool state');
    }

    const native = scValToNative(sim.result.retval) as Record<string, unknown>;

    const reserves = {
      yes: BigInt((native.r_yes ?? native.yes ?? 0) as bigint),
      no: BigInt((native.r_no ?? native.no ?? 0) as bigint),
    };

    const odds = {
      yes: Number(native.odds_yes ?? native.yes_odds ?? 0.5),
      no: Number(native.odds_no ?? native.no_odds ?? 0.5),
    };

    return { reserves, odds };
  }

  /**
   * Wait for transaction finality
   */
  private async waitForTransaction(
    txHash: string,
    maxRetries: number = 10
  ): Promise<any> {
    let retries = 0;
    while (retries < maxRetries) {
      const tx = await this.rpcServer.getTransaction(txHash);
      if (tx.status === 'SUCCESS') return tx;
      if (tx.status === 'FAILED')
        throw new Error('Transaction failed on blockchain');
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
