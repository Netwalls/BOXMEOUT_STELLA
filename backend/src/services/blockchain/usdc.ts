// backend/src/services/blockchain/usdc.ts
// USDC token approval utility for blockchain transactions

import {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  Keypair,
} from '@stellar/stellar-sdk';
import { BaseBlockchainService } from './base.js';
import { logger } from '../../utils/logger.js';

interface ApproveUSDCParams {
  spender: string; // Contract address that needs approval
  amount: bigint; // Amount to approve in USDC base units
  userKeypair?: Keypair; // Optional user keypair for user-signed transactions
}

interface ApproveUSDCResult {
  txHash: string;
  approved: boolean;
  allowance: bigint;
}

export class USDCService extends BaseBlockchainService {
  private readonly usdcTokenAddress: string;

  constructor() {
    super('USDCService');
    this.usdcTokenAddress = process.env.USDC_TOKEN_ADDRESS || '';
  }

  /**
   * Approve USDC spending for a contract
   * Checks existing allowance before approving to avoid unnecessary transactions
   * @param params - Approval parameters
   * @returns Approval result with transaction hash
   */
  async approveUSDC(params: ApproveUSDCParams): Promise<ApproveUSDCResult> {
    if (!this.usdcTokenAddress) {
      throw new Error('USDC token address not configured');
    }

    const signerKeypair = params.userKeypair || this.adminKeypair;
    if (!signerKeypair) {
      throw new Error(
        'No keypair provided - either pass userKeypair or configure ADMIN_WALLET_SECRET'
      );
    }

    try {
      const owner = signerKeypair.publicKey();

      // Check existing allowance first
      const currentAllowance = await this.getAllowance(owner, params.spender);

      // If allowance is sufficient, skip approval
      if (currentAllowance >= params.amount) {
        logger.info('Sufficient USDC allowance already exists', {
          owner,
          spender: params.spender,
          currentAllowance: currentAllowance.toString(),
          requestedAmount: params.amount.toString(),
        });

        return {
          txHash: '',
          approved: true,
          allowance: currentAllowance,
        };
      }

      // Need to approve
      logger.info('Approving USDC spending', {
        owner,
        spender: params.spender,
        amount: params.amount.toString(),
      });

      const contract = new Contract(this.usdcTokenAddress);
      const sourceAccount = await this.rpcServer.getAccount(owner);

      // Build approval transaction
      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          contract.call(
            'approve',
            nativeToScVal(owner, { type: 'address' }),
            nativeToScVal(params.spender, { type: 'address' }),
            nativeToScVal(params.amount, { type: 'i128' }),
            nativeToScVal(0, { type: 'u32' }) // expiration_ledger (0 = no expiration)
          )
        )
        .setTimeout(30)
        .build();

      // Prepare transaction
      const preparedTransaction =
        await this.rpcServer.prepareTransaction(builtTransaction);

      // Sign transaction
      preparedTransaction.sign(signerKeypair);

      // Submit transaction
      const response =
        await this.rpcServer.sendTransaction(preparedTransaction);

      if (response.status === 'PENDING') {
        const txHash = response.hash;

        // Wait for confirmation
        const result = await this.waitForTransaction(
          txHash,
          'approveUSDC',
          params
        );

        if (result.status === 'SUCCESS') {
          logger.info('USDC approval successful', {
            txHash,
            owner,
            spender: params.spender,
            amount: params.amount.toString(),
          });

          return {
            txHash,
            approved: true,
            allowance: params.amount,
          };
        } else {
          throw new Error(`Approval transaction failed: ${result.status}`);
        }
      } else if (response.status === 'ERROR') {
        throw new Error(
          `Approval transaction submission error: ${response.errorResult}`
        );
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error) {
      logger.error('USDC approval error', { error, params });
      throw new Error(
        `Failed to approve USDC: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get current USDC allowance for a spender
   * @param owner - Token owner address
   * @param spender - Spender address
   * @returns Current allowance amount
   */
  async getAllowance(owner: string, spender: string): Promise<bigint> {
    if (!this.usdcTokenAddress) {
      throw new Error('USDC token address not configured');
    }

    try {
      const contract = new Contract(this.usdcTokenAddress);

      // Use any account for simulation (read-only call)
      const accountKey =
        this.adminKeypair?.publicKey() || Keypair.random().publicKey();

      let sourceAccount;
      try {
        sourceAccount = await this.rpcServer.getAccount(accountKey);
      } catch (e) {
        logger.warn(
          'Could not load source account for getAllowance simulation, using random keypair fallback'
        );
        sourceAccount = await this.rpcServer.getAccount(
          Keypair.random().publicKey()
        );
      }

      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          contract.call(
            'allowance',
            nativeToScVal(owner, { type: 'address' }),
            nativeToScVal(spender, { type: 'address' })
          )
        )
        .setTimeout(30)
        .build();

      // Simulate transaction to get result
      const simulationResponse =
        await this.rpcServer.simulateTransaction(builtTransaction);

      if (simulationResponse.results && simulationResponse.results.length > 0) {
        const result = simulationResponse.results[0];
        if (result.retval) {
          // Parse the return value as i128
          const allowanceValue = result.retval.value();
          return BigInt(allowanceValue?.toString() || '0');
        }
      }

      return BigInt(0);
    } catch (error) {
      logger.error('Error getting USDC allowance', { error, owner, spender });
      // Return 0 on error to trigger approval
      return BigInt(0);
    }
  }
}

export const usdcService = new USDCService();
