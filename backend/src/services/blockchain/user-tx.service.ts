// backend/src/services/blockchain/user-tx.service.ts
// Service for validating and submitting user-signed Soroban transactions
// SECURITY: Backend NEVER signs user-fund transactions. User provides signed XDR.

import {
  rpc,
  Networks,
  Transaction,
  FeeBumpTransaction,
  Keypair,
} from '@stellar/stellar-sdk';
import logger from '../../utils/logger.js';

export interface SubmitResult {
  txHash: string;
  status: string;
  returnValue?: any;
}

export class UserSignedTransactionService {
  private readonly rpcServer: rpc.Server;
  private readonly networkPassphrase: string;

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
  }

  /**
   * Verify that a decoded transaction has at least one valid signature
   * from the expected public key.
   *
   * Soroban transactions self-authenticate via their signature envelope —
   * we extract the decoratedSignatures and check the hint + signature
   * against the expected keypair.
   */
  verifySignature(
    tx: Transaction | FeeBumpTransaction,
    expectedPublicKey: string
  ): boolean {
    try {
      const keypair = Keypair.fromPublicKey(expectedPublicKey);
      const hint = keypair.signatureHint();

      if (tx instanceof FeeBumpTransaction) {
        // FeeBumpTransaction wraps an inner transaction; check inner
        return this.verifySignature(tx.innerTransaction, expectedPublicKey);
      }

      const signatures = tx.signatures;
      if (!signatures || signatures.length === 0) {
        return false;
      }

      const txHash = tx.hash();

      for (const sig of signatures) {
        // Match hint (first 4 bytes of public key)
        if (sig.hint().equals(hint)) {
          // Verify the actual cryptographic signature
          if (keypair.verify(txHash, sig.signature())) {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      logger.error('UserSignedTransactionService.verifySignature error', {
        error,
      });
      return false;
    }
  }

  /**
   * Decode a base64 XDR string into a Transaction object.
   * Throws if the XDR is malformed.
   */
  decodeSignedXdr(signedXdrBase64: string): Transaction | FeeBumpTransaction {
    try {
      return new Transaction(signedXdrBase64, this.networkPassphrase);
    } catch {
      // Try as FeeBumpTransaction
      try {
        return new FeeBumpTransaction(signedXdrBase64, this.networkPassphrase);
      } catch (error) {
        throw new Error(
          `Invalid XDR transaction: ${error instanceof Error ? error.message : 'malformed'}`
        );
      }
    }
  }

  /**
   * Full validation + submission pipeline:
   * 1. Decode XDR
   * 2. Verify signature belongs to the expected public key
   * 3. Submit to Soroban and poll for finality
   */
  async validateAndSubmit(
    signedXdrBase64: string,
    userPublicKey: string,
    operationName: string
  ): Promise<SubmitResult> {
    // Step 1: Decode
    const tx = this.decodeSignedXdr(signedXdrBase64);

    // Step 2: Validate signature — SECURITY GATE
    if (!this.verifySignature(tx, userPublicKey)) {
      throw new Error(
        `INVALID_SIGNATURE: Transaction not signed by expected public key ${userPublicKey}`
      );
    }

    // Step 3: Submit
    try {
      const sendResponse = await this.rpcServer.sendTransaction(
        tx as Transaction
      );

      if (sendResponse.status === 'ERROR') {
        throw new Error(
          `Transaction submission error: ${JSON.stringify(sendResponse.errorResult)}`
        );
      }

      if (sendResponse.status !== 'PENDING') {
        throw new Error(`Unexpected submission status: ${sendResponse.status}`);
      }

      const txHash = sendResponse.hash;
      const result = await this.waitForTransaction(txHash, operationName);

      return {
        txHash,
        status: result.status,
        returnValue: result.returnValue,
      };
    } catch (error) {
      logger.error(`UserSignedTransactionService.validateAndSubmit error`, {
        operationName,
        userPublicKey,
        error,
      });
      throw error;
    }
  }

  /**
   * Poll for transaction finality with exponential backoff.
   */
  private async waitForTransaction(
    txHash: string,
    operationName: string,
    maxRetries: number = 12
  ): Promise<any> {
    let retries = 0;
    let backoffMs = 1000;

    while (retries < maxRetries) {
      const txResponse = await this.rpcServer.getTransaction(txHash);

      if (txResponse.status === 'SUCCESS') {
        return txResponse;
      }

      if (txResponse.status === 'FAILED') {
        throw new Error(
          `${operationName} transaction failed on blockchain: ${txHash}`
        );
      }

      // NOT_FOUND — still in progress
      await this.sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, 8000);
      retries++;
    }

    throw new Error(
      `${operationName} transaction confirmation timeout: ${txHash}`
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const userSignedTxService = new UserSignedTransactionService();
