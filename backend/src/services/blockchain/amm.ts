// backend/src/services/blockchain/amm.ts
// AMM contract interaction service

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
