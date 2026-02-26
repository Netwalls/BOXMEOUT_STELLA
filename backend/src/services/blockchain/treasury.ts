// backend/src/services/blockchain/treasury.ts
// Treasury contract interaction service

import {
  Contract,
  rpc,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  Keypair,
} from '@stellar/stellar-sdk';
import { BaseBlockchainService } from './base.js';
import { logger } from '../../utils/logger.js';

export interface TreasuryBalances {
  totalBalance: string;
  leaderboardPool: string;
  creatorPool: string;
  platformFees: string;
}

interface DistributeResult {
  txHash: string;
  recipientCount: number;
  totalDistributed: string;
}

export class TreasuryService extends BaseBlockchainService {
  private treasuryContractId: string;

  constructor() {
    super('TreasuryService');
    this.treasuryContractId = process.env.TREASURY_CONTRACT_ADDRESS || '';
  }

  async getBalances(): Promise<TreasuryBalances> {
    if (!this.treasuryContractId) {
      throw new Error('Treasury contract address not configured');
    }

    try {
      const contract = new Contract(this.treasuryContractId);
      const accountKey =
        this.adminKeypair?.publicKey() || Keypair.random().publicKey();

      let sourceAccount;
      try {
        sourceAccount = await this.rpcServer.getAccount(accountKey);
      } catch (e) {
        logger.warn(
          'Could not load source account for getBalances simulation, using random keypair fallback'
        );
        sourceAccount = await this.rpcServer.getAccount(
          Keypair.random().publicKey()
        );
      }

      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(contract.call('get_balances'))
        .setTimeout(30)
        .build();

      const sim = await this.rpcServer.simulateTransaction(builtTransaction);
      if (!rpc.Api.isSimulationSuccess(sim) || !sim.result?.retval) {
        throw new Error('Failed to fetch treasury balances');
      }

      const balances = scValToNative(sim.result.retval) as any;

      return {
        totalBalance: balances.total_balance?.toString() || '0',
        leaderboardPool: balances.leaderboard_pool?.toString() || '0',
        creatorPool: balances.creator_pool?.toString() || '0',
        platformFees: balances.platform_fees?.toString() || '0',
      };
    } catch (error) {
      logger.error('Treasury balance fetch failed', { error });
      throw new Error(
        `Treasury balance fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async distributeLeaderboard(
    recipients: Array<{ address: string; amount: string }>
  ): Promise<DistributeResult> {
    if (!this.treasuryContractId) {
      throw new Error('Treasury contract address not configured');
    }
    if (!this.adminKeypair) {
      throw new Error(
        'ADMIN_WALLET_SECRET not configured - cannot sign transactions'
      );
    }

    try {
      const contract = new Contract(this.treasuryContractId);
      const sourceAccount = await this.rpcServer.getAccount(
        this.adminKeypair.publicKey()
      );

      const recipientsScVal = nativeToScVal(
        recipients.map((r) => ({
          address: r.address,
          amount: BigInt(r.amount),
        })),
        { type: 'Vec' }
      );

      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(contract.call('distribute_leaderboard', recipientsScVal))
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
        await this.waitForTransaction(txHash, 'distributeLeaderboard', {
          recipientsCount: recipients.length,
        });

        const totalDistributed = recipients
          .reduce((sum, r) => sum + BigInt(r.amount), BigInt(0))
          .toString();

        return {
          txHash,
          recipientCount: recipients.length,
          totalDistributed,
        };
      }

      throw new Error('Transaction submission failed');
    } catch (error) {
      logger.error('Leaderboard distribution failed', { error });
      throw new Error(
        `Leaderboard distribution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async distributeCreator(
    marketId: string,
    creatorAddress: string,
    amount: string
  ): Promise<DistributeResult> {
    if (!this.treasuryContractId) {
      throw new Error('Treasury contract address not configured');
    }
    if (!this.adminKeypair) {
      throw new Error(
        'ADMIN_WALLET_SECRET not configured - cannot sign transactions'
      );
    }

    try {
      const contract = new Contract(this.treasuryContractId);
      const sourceAccount = await this.rpcServer.getAccount(
        this.adminKeypair.publicKey()
      );

      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          contract.call(
            'distribute_creator',
            nativeToScVal(marketId, { type: 'symbol' }),
            nativeToScVal(creatorAddress, { type: 'address' }),
            nativeToScVal(BigInt(amount), { type: 'i128' })
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
        await this.waitForTransaction(txHash, 'distributeCreator', {
          marketId,
          creatorAddress,
          amount,
        });

        return {
          txHash,
          recipientCount: 1,
          totalDistributed: amount,
        };
      }

      throw new Error('Transaction submission failed');
    } catch (error) {
      logger.error('Creator distribution failed', { error });
      throw new Error(
        `Creator distribution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

export const treasuryService = new TreasuryService();
