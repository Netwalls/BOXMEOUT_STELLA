// backend/src/services/blockchain/amm.ts
// AMM (Automated Market Maker) contract interaction service
//
// SECURITY MODEL:
//   Admin key  → createPool, getPoolState, buyShares (direct), sellShares (direct)
//   User key   → buildXxxTx (for frontend signing), submitSignedTx
//
// For user-signed operations the backend NEVER signs. Instead:
//   1. buildXxxTx()     → returns unsigned base64 XDR for the frontend to sign
//   2. submitSignedTx() → validates signature, then submits to Soroban

import {
  Contract,
  rpc,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  xdr,
  Keypair,
} from '@stellar/stellar-sdk';
import { BaseBlockchainService } from './base.js';
import { logger } from '../../utils/logger.js';
import { userSignedTxService, SubmitResult } from './user-tx.service.js';

// ─── Param/result interfaces ──────────────────────────────────────────────────

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

interface CreatePoolParams {
  marketId: string; // hex string (BytesN<32>)
  initialLiquidity: bigint;
}

interface CreatePoolResult {
  txHash: string;
  reserves: { yes: bigint; no: bigint };
  odds: { yes: number; no: number };
}

export interface BuySharesTxParams {
  marketId: string;
  outcome: number; // 0 = NO, 1 = YES
  amountUsdc: bigint;
  minShares: bigint;
}

export interface SellSharesTxParams {
  marketId: string;
  outcome: number; // 0 = NO, 1 = YES
  shares: bigint;
  minPayout: bigint;
}

export interface AddLiquidityTxParams {
  marketId: string;
  usdcAmount: bigint;
}

export interface RemoveLiquidityTxParams {
  marketId: string;
  lpTokens: bigint;
}

interface AddLiquidityParams {
  marketId: string; // hex string (BytesN<32>)
  usdcAmount: bigint;
}

interface AddLiquidityResult {
  lpTokensMinted: bigint;
  txHash: string;
}

interface RemoveLiquidityParams {
  marketId: string; // hex string (BytesN<32>)
  lpTokens: bigint;
}

interface RemoveLiquidityResult {
  yesAmount: bigint;
  noAmount: bigint;
  totalUsdcReturned: bigint;
  txHash: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class AmmService extends BaseBlockchainService {
  private readonly ammContractId: string;

  constructor() {
    super('AmmService');
    this.ammContractId = process.env.AMM_CONTRACT_ADDRESS || '';
  }

  /**
   * Buy outcome shares from the AMM (Direct/Admin-signed)
   * @param params - Buy parameters
   * @returns Shares received and transaction details
   */
  async buyShares(params: BuySharesParams): Promise<BuySharesResult> {
    if (!this.ammContractId) {
      throw new Error('AMM contract address not configured');
    }
    if (!this.adminKeypair) {
      throw new Error(
        'ADMIN_WALLET_SECRET not configured - cannot sign transactions'
      );
    }

    try {
      const contract = new Contract(this.ammContractId);
      const sourceAccount = await this.rpcServer.getAccount(
        this.adminKeypair.publicKey()
      );

      // Build the contract call operation
      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          contract.call(
            'buy_shares',
            nativeToScVal(this.adminKeypair.publicKey(), { type: 'address' }),
            nativeToScVal(
              Buffer.from(params.marketId.replace(/^0x/, ''), 'hex')
            ),
            nativeToScVal(params.outcome, { type: 'u32' }),
            nativeToScVal(params.amountUsdc, { type: 'i128' }),
            nativeToScVal(params.minShares, { type: 'i128' })
          )
        )
        .setTimeout(30)
        .build();

      // Prepare transaction for the network
      const preparedTransaction =
        await this.rpcServer.prepareTransaction(builtTransaction);

      // Sign transaction
      preparedTransaction.sign(this.adminKeypair);

      // Submit transaction
      const response =
        await this.rpcServer.sendTransaction(preparedTransaction);

      if (response.status === 'PENDING') {
        const txHash = response.hash;
        // Use unified retry logic from BaseBlockchainService
        const result = await this.waitForTransaction(
          txHash,
          'buyShares',
          params
        );

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
        throw new Error(
          `Transaction submission error: ${response.errorResult}`
        );
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error) {
      logger.error('AMM.buy_shares() error', { error });
      throw new Error(
        `Failed to buy shares: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Sell outcome shares to the AMM (Direct/Admin-signed)
   * @param params - Sell parameters
   * @returns Payout received and transaction details
   */
  async sellShares(params: SellSharesParams): Promise<SellSharesResult> {
    if (!this.ammContractId) {
      throw new Error('AMM contract address not configured');
    }
    if (!this.adminKeypair) {
      throw new Error(
        'ADMIN_WALLET_SECRET not configured - cannot sign transactions'
      );
    }

    try {
      const contract = new Contract(this.ammContractId);
      const sourceAccount = await this.rpcServer.getAccount(
        this.adminKeypair.publicKey()
      );

      // Build the contract call operation
      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          contract.call(
            'sell_shares',
            nativeToScVal(this.adminKeypair.publicKey(), { type: 'address' }),
            nativeToScVal(
              Buffer.from(params.marketId.replace(/^0x/, ''), 'hex')
            ),
            nativeToScVal(params.outcome, { type: 'u32' }),
            nativeToScVal(params.shares, { type: 'i128' }),
            nativeToScVal(params.minPayout, { type: 'i128' })
          )
        )
        .setTimeout(30)
        .build();

      // Prepare transaction for the network
      const preparedTransaction =
        await this.rpcServer.prepareTransaction(builtTransaction);

      // Sign transaction
      preparedTransaction.sign(this.adminKeypair);

      // Submit transaction
      const response =
        await this.rpcServer.sendTransaction(preparedTransaction);

      if (response.status === 'PENDING') {
        const txHash = response.hash;
        // Use unified retry logic from BaseBlockchainService
        const result = await this.waitForTransaction(
          txHash,
          'sellShares',
          params
        );

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
        throw new Error(
          `Transaction submission error: ${response.errorResult}`
        );
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error) {
      logger.error('AMM.sell_shares() error', { error });
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
      // For read-only calls, any source account works.
      const accountKey =
        this.adminKeypair?.publicKey() || Keypair.random().publicKey();

      let sourceAccount;
      try {
        sourceAccount = await this.rpcServer.getAccount(accountKey);
      } catch (e) {
        logger.warn(
          'Could not load source account for getOdds simulation, using random keypair fallback'
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
            'get_odds',
            nativeToScVal(Buffer.from(marketId.replace(/^0x/, ''), 'hex'))
          )
        )
        .setTimeout(30)
        .build();

      // Simulate transaction to get result without submitting
      const simulationResponse =
        await this.rpcServer.simulateTransaction(builtTransaction);

      if (rpc.Api.isSimulationSuccess(simulationResponse)) {
        const result = simulationResponse.result?.retval;
        if (!result) {
          throw new Error('No return value from simulation');
        }

        // Fetch pool state for liquidity info
        const { reserves } = await this.getPoolState(marketId);
        const yesLiquidity = Number(reserves.yes);
        const noLiquidity = Number(reserves.no);

        const odds = this.parseOddsResult(result);

        return {
          ...odds,
          yesLiquidity,
          noLiquidity,
          totalLiquidity: yesLiquidity + noLiquidity,
        };
      }

      throw new Error('Failed to get market odds');
    } catch (error) {
      logger.error('Error getting market odds', { error });
      throw new Error(
        `Failed to get odds: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ── Admin-only: create pool ────────────────────────────────────────────────

  /**
   * Call AMM.create_pool(market_id, initial_liquidity) — signed by admin.
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

    try {
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
            nativeToScVal(
              Buffer.from(params.marketId.replace(/^0x/, ''), 'hex')
            ),
            nativeToScVal(params.initialLiquidity, { type: 'i128' })
          )
        )
        .setTimeout(30)
        .build();

      const prepared = await this.rpcServer.prepareTransaction(builtTx);
      prepared.sign(this.adminKeypair);

      const sendResponse = await this.rpcServer.sendTransaction(prepared);

      if (sendResponse.status === 'PENDING') {
        const txHash = sendResponse.hash;
        const result = await this.waitForTransaction(
          txHash,
          'createPool',
          params
        );

        if (result.status === 'SUCCESS') {
          const { reserves, odds } = await this.getPoolState(params.marketId);

          return {
            txHash,
            reserves,
            odds,
          };
        } else {
          throw new Error(`Transaction failed: ${result.status}`);
        }
      } else {
        throw new Error(
          `Transaction submission failed: ${sendResponse.status}`
        );
      }
    } catch (error) {
      logger.error('AMM.create_pool() error', { error });
      throw new Error(
        `Failed to create pool: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Add USDC liquidity to an existing pool and receive minted LP tokens.
   * Calls AMM.add_liquidity(lp_provider, market_id, usdc_amount)
   * @param params - Add liquidity parameters
   * @returns LP tokens minted and transaction hash
   */
  async addLiquidity(params: AddLiquidityParams): Promise<AddLiquidityResult> {
    if (!this.ammContractId) {
      throw new Error('AMM contract address not configured');
    }
    if (!this.adminKeypair) {
      throw new Error(
        'ADMIN_WALLET_SECRET not configured - cannot sign transactions'
      );
    }

    try {
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
            'add_liquidity',
            nativeToScVal(this.adminKeypair.publicKey(), { type: 'address' }),
            nativeToScVal(
              Buffer.from(params.marketId.replace(/^0x/, ''), 'hex')
            ),
            nativeToScVal(params.usdcAmount, { type: 'i128' })
          )
        )
        .setTimeout(30)
        .build();

      const prepared = await this.rpcServer.prepareTransaction(builtTx);
      prepared.sign(this.adminKeypair);

      const sendResponse = await this.rpcServer.sendTransaction(prepared);

      if (sendResponse.status === 'PENDING') {
        const txHash = sendResponse.hash;
        const result = await this.waitForTransaction(
          txHash,
          'addLiquidity',
          params
        );

        if (result.status === 'SUCCESS') {
          // Contract returns i128 LP tokens minted
          const lpTokensMinted = result.returnValue
            ? BigInt(scValToNative(result.returnValue) as bigint)
            : BigInt(0);

          return { lpTokensMinted, txHash };
        } else {
          throw new Error(`Transaction failed: ${result.status}`);
        }
      } else {
        throw new Error(
          `Transaction submission failed: ${sendResponse.status}`
        );
      }
    } catch (error) {
      logger.error('AMM.add_liquidity() error', { error });
      throw new Error(
        `Failed to add liquidity: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Remove liquidity from an existing pool by redeeming LP tokens.
   * Calls AMM.remove_liquidity(lp_provider, market_id, lp_tokens)
   * @param params - Remove liquidity parameters
   * @returns YES/NO amounts and total USDC returned, plus transaction hash
   */
  async removeLiquidity(
    params: RemoveLiquidityParams
  ): Promise<RemoveLiquidityResult> {
    if (!this.ammContractId) {
      throw new Error('AMM contract address not configured');
    }
    if (!this.adminKeypair) {
      throw new Error(
        'ADMIN_WALLET_SECRET not configured - cannot sign transactions'
      );
    }

    try {
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
            'remove_liquidity',
            nativeToScVal(this.adminKeypair.publicKey(), { type: 'address' }),
            nativeToScVal(
              Buffer.from(params.marketId.replace(/^0x/, ''), 'hex')
            ),
            nativeToScVal(params.lpTokens, { type: 'i128' })
          )
        )
        .setTimeout(30)
        .build();

      const prepared = await this.rpcServer.prepareTransaction(builtTx);
      prepared.sign(this.adminKeypair);

      const sendResponse = await this.rpcServer.sendTransaction(prepared);

      if (sendResponse.status === 'PENDING') {
        const txHash = sendResponse.hash;
        const result = await this.waitForTransaction(
          txHash,
          'removeLiquidity',
          params
        );

        if (result.status === 'SUCCESS') {
          // Contract returns (i128, i128) tuple → (yes_amount, no_amount)
          const native = result.returnValue
            ? scValToNative(result.returnValue)
            : [BigInt(0), BigInt(0)];
          const pair = Array.isArray(native) ? native : [BigInt(0), BigInt(0)];
          const yesAmount = BigInt(pair[0] ?? 0);
          const noAmount = BigInt(pair[1] ?? 0);

          return {
            yesAmount,
            noAmount,
            totalUsdcReturned: yesAmount + noAmount,
            txHash,
          };
        } else {
          throw new Error(`Transaction failed: ${result.status}`);
        }
      } else {
        throw new Error(
          `Transaction submission failed: ${sendResponse.status}`
        );
      }
    } catch (error) {
      logger.error('AMM.remove_liquidity() error', { error });
      throw new Error(
        `Failed to remove liquidity: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  // ── Read-only: pool state ──────────────────────────────────────────────────

  async getPoolState(marketId: string): Promise<{
    reserves: { yes: bigint; no: bigint };
    odds: { yes: number; no: number };
  }> {
    if (!this.ammContractId) {
      throw new Error('AMM contract address not configured');
    }

    const contract = new Contract(this.ammContractId);

    const accountKey =
      this.adminKeypair?.publicKey() || Keypair.random().publicKey();

    let sourceAccount;
    try {
      sourceAccount = await this.rpcServer.getAccount(accountKey);
    } catch (e) {
      logger.warn(
        'Could not load source account for getPoolState simulation, using random keypair fallback'
      );
      sourceAccount = await this.rpcServer.getAccount(
        Keypair.random().publicKey()
      );
    }

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

  // ── User-signed: build unsigned XDR ───────────────────────────────────────

  /**
   * Build an unsigned buy_shares transaction.
   * The returned base64 XDR must be signed by `userPublicKey` before submitting.
   *
   * SECURITY: userPublicKey is passed as the buyer argument — on-chain positions
   * will belong to the user, never to the admin.
   */
  async buildBuySharesTx(
    userPublicKey: string,
    params: BuySharesTxParams
  ): Promise<string> {
    if (!this.ammContractId) {
      throw new Error('AMM contract address not configured');
    }

    const contract = new Contract(this.ammContractId);
    const sourceAccount = await this.rpcServer.getAccount(userPublicKey);

    const builtTx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        contract.call(
          'buy_shares',
          // buyer = user's own public key, NOT admin
          nativeToScVal(userPublicKey, { type: 'address' }),
          nativeToScVal(Buffer.from(params.marketId.replace(/^0x/, ''), 'hex')),
          nativeToScVal(params.outcome, { type: 'u32' }),
          nativeToScVal(params.amountUsdc, { type: 'i128' }),
          nativeToScVal(params.minShares, { type: 'i128' })
        )
      )
      .setTimeout(30)
      .build();

    // prepareTransaction fetches simulation footprint — still unsigned
    const prepared = await this.rpcServer.prepareTransaction(builtTx);
    return prepared.toXDR();
  }

  /**
   * Build an unsigned sell_shares transaction.
   */
  async buildSellSharesTx(
    userPublicKey: string,
    params: SellSharesTxParams
  ): Promise<string> {
    if (!this.ammContractId) {
      throw new Error('AMM contract address not configured');
    }

    const contract = new Contract(this.ammContractId);
    const sourceAccount = await this.rpcServer.getAccount(userPublicKey);

    const builtTx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        contract.call(
          'sell_shares',
          // seller = user, NOT admin
          nativeToScVal(userPublicKey, { type: 'address' }),
          nativeToScVal(Buffer.from(params.marketId.replace(/^0x/, ''), 'hex')),
          nativeToScVal(params.outcome, { type: 'u32' }),
          nativeToScVal(params.shares, { type: 'i128' }),
          nativeToScVal(params.minPayout, { type: 'i128' })
        )
      )
      .setTimeout(30)
      .build();

    const prepared = await this.rpcServer.prepareTransaction(builtTx);
    return prepared.toXDR();
  }

  /**
   * Build an unsigned add_liquidity transaction.
   */
  async buildAddLiquidityTx(
    userPublicKey: string,
    params: AddLiquidityTxParams
  ): Promise<string> {
    if (!this.ammContractId) {
      throw new Error('AMM contract address not configured');
    }

    const contract = new Contract(this.ammContractId);
    const sourceAccount = await this.rpcServer.getAccount(userPublicKey);

    const builtTx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        contract.call(
          'add_liquidity',
          nativeToScVal(userPublicKey, { type: 'address' }),
          nativeToScVal(Buffer.from(params.marketId.replace(/^0x/, ''), 'hex')),
          nativeToScVal(params.usdcAmount, { type: 'i128' })
        )
      )
      .setTimeout(30)
      .build();

    const prepared = await this.rpcServer.prepareTransaction(builtTx);
    return prepared.toXDR();
  }

  /**
   * Build an unsigned remove_liquidity transaction.
   */
  async buildRemoveLiquidityTx(
    userPublicKey: string,
    params: RemoveLiquidityTxParams
  ): Promise<string> {
    if (!this.ammContractId) {
      throw new Error('AMM contract address not configured');
    }

    const contract = new Contract(this.ammContractId);
    const sourceAccount = await this.rpcServer.getAccount(userPublicKey);

    const builtTx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        contract.call(
          'remove_liquidity',
          nativeToScVal(userPublicKey, { type: 'address' }),
          nativeToScVal(Buffer.from(params.marketId.replace(/^0x/, ''), 'hex')),
          nativeToScVal(params.lpTokens, { type: 'i128' })
        )
      )
      .setTimeout(30)
      .build();

    const prepared = await this.rpcServer.prepareTransaction(builtTx);
    return prepared.toXDR();
  }

  // ── User-signed: validate + submit ────────────────────────────────────────

  /**
   * Validate the user's signature on a pre-signed XDR and submit it.
   *
   * SECURITY: userPublicKey comes from the verified JWT — it is never
   * controlled by the request body.
   */
  async submitSignedTx(
    signedXdrBase64: string,
    userPublicKey: string,
    operationName: string
  ): Promise<SubmitResult> {
    return userSignedTxService.validateAndSubmit(
      signedXdrBase64,
      userPublicKey,
      operationName
    );
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Parse buy_shares contract return value
   * @param returnValue - Contract return value
   * @returns Parsed buy result
   */
  private parseBuySharesResult(
    returnValue: xdr.ScVal | undefined
  ): Omit<BuySharesResult, 'txHash'> {
    if (!returnValue) {
      throw new Error('No return value from contract');
    }

    try {
      // Expected return format: { shares_received, price_per_unit, total_cost, fee_amount }
      const result = scValToNative(returnValue);

      return {
        sharesReceived: Number(
          result.shares_received || result.sharesReceived || 0
        ),
        pricePerUnit: Number(result.price_per_unit || result.pricePerUnit || 0),
        totalCost: Number(result.total_cost || result.totalCost || 0),
        feeAmount: Number(result.fee_amount || result.feeAmount || 0),
      };
    } catch (error) {
      logger.error('Error parsing buy shares result', { error });
      throw new Error('Failed to parse contract response');
    }
  }

  /**
   * Parse sell_shares contract return value
   * @param returnValue - Contract return value
   * @returns Parsed sell result
   */
  private parseSellSharesResult(
    returnValue: xdr.ScVal | undefined
  ): Omit<SellSharesResult, 'txHash'> {
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
      logger.error('Error parsing sell shares result', { error });
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
      const result = scValToNative(returnValue);
      let yesOdds = 0.5;
      let noOdds = 0.5;
      let yesLiquidity = 0;
      let noLiquidity = 0;

      if (Array.isArray(result)) {
        // Handle basis points array [yes_bp, no_bp]
        yesOdds = Number(result[0]) / 10000;
        noOdds = Number(result[1]) / 10000;
      } else {
        // Expected return format: { yes_odds, no_odds, yes_liquidity, no_liquidity }
        yesOdds = Number(result.yes_odds || result.yesOdds || 0.5);
        noOdds = Number(result.no_odds || result.noOdds || 0.5);
        yesLiquidity = Number(result.yes_liquidity || result.yesLiquidity || 0);
        noLiquidity = Number(result.no_liquidity || result.noLiquidity || 0);
      }

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
      logger.error('Error parsing odds result', { error });
      throw new Error('Failed to parse odds response');
    }
  }
}

export const ammService = new AmmService();
