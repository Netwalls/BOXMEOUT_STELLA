import {
  Contract,
  rpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Keypair,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import { logger } from '../../utils/logger.js';

export interface MarketActionResult {
  txHash: string;
}

export class MarketBlockchainService {
  private rpcServer: rpc.Server;
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
    this.networkPassphrase =
      network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

    const adminSecret = process.env.ADMIN_WALLET_SECRET;
    if (adminSecret) {
      try {
        this.adminKeypair = Keypair.fromSecret(adminSecret);
      } catch (error) {
        logger.warn('Invalid ADMIN_WALLET_SECRET for Market service');
      }
    }
  }

  /**
   * Resolve a market on the blockchain
   * @param marketContractAddress - The contract address of the market
   * @returns Transaction hash
   */
  async resolveMarket(
    marketContractAddress: string
  ): Promise<MarketActionResult> {
    if (!this.adminKeypair) {
      throw new Error(
        'ADMIN_WALLET_SECRET not configured - cannot sign transactions'
      );
    }
    try {
      const contract = new Contract(marketContractAddress);
      const sourceAccount = await this.rpcServer.getAccount(
        this.adminKeypair.publicKey()
      );

      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(contract.call('resolve_market'))
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
      logger.error('Market.resolve_market() error', { error });
      throw new Error(
        `Failed to resolve market on blockchain: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Claim winnings for a user (called by the user backend on their behalf or signed by user)
   * Acceptance criteria says: Call Market.claim_winnings()
   * Usually this is signed by the user, but if the backend is an intermediary/custodial:
   */
  async claimWinnings(
    marketContractAddress: string,
    userPublicKey: string
  ): Promise<MarketActionResult> {
    if (!this.adminKeypair) {
      throw new Error(
        'ADMIN_WALLET_SECRET not configured - cannot sign transactions'
      );
    }
    try {
      const contract = new Contract(marketContractAddress);
      const sourceAccount = await this.rpcServer.getAccount(
        this.adminKeypair.publicKey()
      );

      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          contract.call(
            'claim_winnings',
            nativeToScVal(userPublicKey, { type: 'address' })
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
      logger.error('Market.claim_winnings() error', { error });
      throw new Error(
        `Failed to claim winnings on blockchain: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
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

export const marketBlockchainService = new MarketBlockchainService();
