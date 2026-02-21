import {
  Contract,
  rpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Keypair,
  nativeToScVal,
  scValToNative,
  Address,
} from '@stellar/stellar-sdk';
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

export class TreasuryService {
  private rpcServer: rpc.Server;
  private treasuryContractId: string;
  private networkPassphrase: string;
  private adminKeypair?: Keypair; // Optional - only needed for write operations

  constructor() {
    const rpcUrl =
      process.env.STELLAR_SOROBAN_RPC_URL ||
      'https://soroban-testnet.stellar.org';
    const network = process.env.STELLAR_NETWORK || 'testnet';

    this.rpcServer = new rpc.Server(rpcUrl, {
      allowHttp: rpcUrl.includes('localhost'),
    });
    this.treasuryContractId = process.env.TREASURY_CONTRACT_ADDRESS || '';
    this.networkPassphrase =
      network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

    const adminSecret = process.env.ADMIN_WALLET_SECRET;
    if (adminSecret) {
      try {
        this.adminKeypair = Keypair.fromSecret(adminSecret);
      } catch (error) {
        logger.warn('Invalid ADMIN_WALLET_SECRET for Treasury service');
      }
    }
  }

  async getBalances(): Promise<TreasuryBalances> {
    if (!this.treasuryContractId) {
      throw new Error('Treasury contract address not configured');
    }

    try {
      const contract = new Contract(this.treasuryContractId);
      // Read-only call - use admin if available, otherwise dummy keypair
      const accountKey =
        this.adminKeypair?.publicKey() || Keypair.random().publicKey();
      const sourceAccount = await this.rpcServer.getAccount(accountKey);

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
        await this.pollTransactionResult(response.hash);

        const totalDistributed = recipients
          .reduce((sum, r) => sum + BigInt(r.amount), BigInt(0))
          .toString();

        return {
          txHash: response.hash,
          recipientCount: recipients.length,
          totalDistributed,
        };
      }

      throw new Error('Transaction submission failed');
    } catch (error) {
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
        await this.pollTransactionResult(response.hash);

        return {
          txHash: response.hash,
          recipientCount: 1,
          totalDistributed: amount,
        };
      }

      throw new Error('Transaction submission failed');
    } catch (error) {
      throw new Error(
        `Creator distribution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async pollTransactionResult(
    hash: string,
    maxAttempts = 20
  ): Promise<any> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const transaction = await this.rpcServer.getTransaction(hash);

      if (transaction.status === 'SUCCESS') {
        return transaction;
      }

      if (transaction.status === 'FAILED') {
        throw new Error('Transaction failed');
      }
    }

    throw new Error('Transaction polling timeout');
  }
}

export const treasuryService = new TreasuryService();
