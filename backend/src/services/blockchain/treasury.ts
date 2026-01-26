import {
  Contract,
  Soroban,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Keypair,
  nativeToScVal,
  Address, BytesN, Env, Symbol,
} from '@stellar/stellar-sdk';

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
  private rpcServer: Soroban.Server;
  private treasuryContractId: string;
  private networkPassphrase: string;
  private adminKeypair: Keypair;

  constructor() {
    const rpcUrl = process.env.STELLAR_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
    const network = process.env.STELLAR_NETWORK || 'testnet';
    
    this.rpcServer = new Soroban.Server(rpcUrl, { allowHttp: rpcUrl.includes('localhost') });
    this.treasuryContractId = process.env.TREASURY_CONTRACT_ADDRESS || '';
    this.networkPassphrase = network === 'mainnet' 
      ? Networks.PUBLIC 
      : Networks.TESTNET;
    
    const adminSecret = process.env.ADMIN_WALLET_SECRET;
    if (!adminSecret) {
      throw new Error('ADMIN_WALLET_SECRET not configured');
    }
    this.adminKeypair = Keypair.fromSecret(adminSecret);
  }

  async getBalances(): Promise<TreasuryBalances> {
    if (!this.treasuryContractId) {
      throw new Error('Treasury contract address not configured');
    }

    try {
      const contract = new Contract(this.treasuryContractId);
      const sourceAccount = await this.rpcServer.getAccount(this.adminKeypair.publicKey());

      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(contract.call('get_balances'))
        .setTimeout(30)
        .build();

      const preparedTransaction = await this.rpcServer.prepareTransaction(builtTransaction);
      const response = await this.rpcServer.sendTransaction(preparedTransaction);

      if (response.status === 'PENDING') {
        const result = await this.pollTransactionResult(response.hash);
        const balances = scValToNative(result.returnValue);
        
        return {
          totalBalance: balances.total_balance.toString(),
          leaderboardPool: balances.leaderboard_pool.toString(),
          creatorPool: balances.creator_pool.toString(),
          platformFees: balances.platform_fees.toString(),
        };
      }

      throw new Error('Failed to fetch treasury balances');
    } catch (error) {
      throw new Error(
        `Treasury balance fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async distributeLeaderboard(recipients: Array<{ address: string; amount: string }>): Promise<DistributeResult> {
    if (!this.treasuryContractId) {
      throw new Error('Treasury contract address not configured');
    }

    try {
      const contract = new Contract(this.treasuryContractId);
      const sourceAccount = await this.rpcServer.getAccount(this.adminKeypair.publicKey());

      const recipientsScVal = nativeToScVal(
        recipients.map(r => ({
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

      const preparedTransaction = await this.rpcServer.prepareTransaction(builtTransaction);
      preparedTransaction.sign(this.adminKeypair);

      const response = await this.rpcServer.sendTransaction(preparedTransaction);

      if (response.status === 'PENDING') {
        await this.pollTransactionResult(response.hash);
        
        const totalDistributed = recipients.reduce(
          (sum, r) => sum + BigInt(r.amount),
          BigInt(0)
        ).toString();

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

  async distributeCreator(marketId: string, creatorAddress: string, amount: string): Promise<DistributeResult> {
    if (!this.treasuryContractId) {
      throw new Error('Treasury contract address not configured');
    }

    try {
      const contract = new Contract(this.treasuryContractId);
      const sourceAccount = await this.rpcServer.getAccount(this.adminKeypair.publicKey());

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

      const preparedTransaction = await this.rpcServer.prepareTransaction(builtTransaction);
      preparedTransaction.sign(this.adminKeypair);

      const response = await this.rpcServer.sendTransaction(preparedTransaction);

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

  private async pollTransactionResult(hash: string, maxAttempts = 20): Promise<any> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));

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
