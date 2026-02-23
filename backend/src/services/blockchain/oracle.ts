// backend/src/services/blockchain/oracle.ts
// Oracle contract interaction service

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

export interface AttestationResult {
  txHash: string;
}

export class OracleService {
  private rpcServer: rpc.Server;
  private oracleContractId: string;
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
    this.oracleContractId = process.env.ORACLE_CONTRACT_ADDRESS || '';
    this.networkPassphrase =
      network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

    const adminSecret = process.env.ADMIN_WALLET_SECRET;
    if (adminSecret) {
      try {
        this.adminKeypair = Keypair.fromSecret(adminSecret);
      } catch (error) {
        logger.warn('Invalid ADMIN_WALLET_SECRET for Oracle service');
      }
    }
  }

  /**
   * Submit an attestation to the oracle contract
   * @param marketId - The ID of the market (BytesN<32>)
   * @param outcome - The outcome being attested (0 or 1)
   * @returns Transaction hash
   */
  async submitAttestation(
    marketId: string,
    outcome: number
  ): Promise<AttestationResult> {
    if (!this.oracleContractId) {
      throw new Error('Oracle contract address not configured');
    }
    if (!this.adminKeypair) {
      throw new Error(
        'ADMIN_WALLET_SECRET not configured - cannot sign transactions'
      );
    }

    try {
      const contract = new Contract(this.oracleContractId);
      const sourceAccount = await this.rpcServer.getAccount(
        this.adminKeypair.publicKey()
      );

      // marketId is hex string, convert to Buffer
      const marketIdBuffer = Buffer.from(marketId, 'hex');

      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          contract.call(
            'submit_attestation',
            nativeToScVal(marketIdBuffer, { type: 'bytes' }),
            nativeToScVal(outcome, { type: 'u32' })
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
      logger.error('Oracle.submit_attestation() error', { error });
      throw new Error(
        `Failed to submit attestation on blockchain: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Check if consensus has been reached for a market
   * @param marketId - The ID of the market
   * @returns The winning outcome if consensus reached, otherwise null
   */
  async checkConsensus(marketId: string): Promise<number | null> {
    if (!this.oracleContractId) {
      throw new Error('Oracle contract address not configured');
    }

    try {
      const contract = new Contract(this.oracleContractId);
      const marketIdBuffer = Buffer.from(marketId, 'hex');
      const accountKey =
        this.adminKeypair?.publicKey() || Keypair.random().publicKey();
      const sourceAccount = await this.rpcServer.getAccount(accountKey);

      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          contract.call(
            'check_consensus',
            nativeToScVal(marketIdBuffer, { type: 'bytes' })
          )
        )
        .setTimeout(30)
        .build();

      const simulationResponse =
        await this.rpcServer.simulateTransaction(builtTransaction);

      if (rpc.Api.isSimulationSuccess(simulationResponse)) {
        const result = simulationResponse.result?.retval;
        if (!result) return null;
        const native = scValToNative(result);
        return native !== undefined ? (native as number) : null;
      }

      return null;
    } catch (error) {
      logger.error('Error checking consensus', { error });
      return null;
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

export const oracleService = new OracleService();
