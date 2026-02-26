// backend/src/services/blockchain/base.ts
// Base class for blockchain services providing retry logic and common configuration

import { rpc, Networks, Keypair } from '@stellar/stellar-sdk';
import { prisma } from '../../database/prisma.js';
import { logger } from '../../utils/logger.js';

export abstract class BaseBlockchainService {
  protected readonly rpcServer: rpc.Server;
  protected readonly networkPassphrase: string;
  protected adminKeypair?: Keypair;
  protected readonly serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
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
        logger.warn(`Invalid ADMIN_WALLET_SECRET for ${serviceName}`);
      }
    }

    // Fallback logic from recent updates
    if (!this.adminKeypair) {
      if (process.env.NODE_ENV !== 'production') {
        if (!adminSecret) {
          logger.warn(
            `${serviceName}: ADMIN_WALLET_SECRET not configured, using random keypair for development (Warning: No funds)`
          );
        }
        this.adminKeypair = Keypair.random();
      } else {
        if (!adminSecret)
          logger.warn(`${serviceName}: ADMIN_WALLET_SECRET not configured`);
      }
    }
  }

  /**
   * Wait for a transaction to reach finality with exponential backoff and network retries
   */
  protected async waitForTransaction(
    txHash: string,
    functionName: string,
    params: any = {},
    maxNetworkRetries: number = 3,
    maxPollingRetries: number = 10
  ): Promise<any> {
    let pollingRetries = 0;
    let networkRetries = 0;
    let backoffSeconds = 1;

    while (pollingRetries < maxPollingRetries) {
      try {
        const txResponse = await this.rpcServer.getTransaction(txHash);

        if (txResponse.status === 'SUCCESS') {
          return txResponse;
        }

        if (txResponse.status === 'FAILED') {
          const errorMsg = 'Transaction failed on blockchain';
          await this.addToDLQ(txHash, functionName, params, errorMsg);
          throw new Error(errorMsg);
        }

        // NOT_FOUND or other non-final status, wait and retry
        await this.sleep(backoffSeconds * 1000);

        // Exponential backoff capped at 8s (1, 2, 4, 8, 8...)
        if (backoffSeconds < 8) {
          backoffSeconds *= 2;
        }
        pollingRetries++;
      } catch (error: any) {
        // If it's a known blockchain failure, don't retry network count
        if (error.message === 'Transaction failed on blockchain') {
          throw error;
        }

        // Handle network/RPC errors with separate retry count
        networkRetries++;
        console.warn(
          `Network error in waitForTransaction (${this.serviceName}.${functionName}), retry ${networkRetries}/${maxNetworkRetries}:`,
          error.message
        );

        if (networkRetries >= maxNetworkRetries) {
          const errorMsg = `Max network retries reached: ${error.message}`;
          await this.addToDLQ(txHash, functionName, params, errorMsg);
          throw new Error(errorMsg);
        }

        // Wait before network retry
        await this.sleep(2000);
      }
    }

    const timeoutMsg = 'Transaction confirmation timeout';
    await this.addToDLQ(txHash, functionName, params, timeoutMsg);
    throw new Error(timeoutMsg);
  }

  /**
   * Log permanently failed transactions to the Dead Letter Queue
   */
  protected async addToDLQ(
    txHash: string,
    functionName: string,
    params: any,
    error: string
  ): Promise<void> {
    try {
      console.error(
        `Logging failed transaction to DLQ: ${txHash} (${this.serviceName}.${functionName}) - Error: ${error}`
      );

      await prisma.blockchainDeadLetterQueue.upsert({
        where: { txHash },
        update: {
          error,
          status: 'FAILED',
          updatedAt: new Date(),
        },
        create: {
          txHash,
          serviceName: this.serviceName,
          functionName,
          params: params || {},
          error,
          status: 'FAILED',
        },
      });

      // Trigger alerts here (integration with monitoring service)
      this.triggerAlert(txHash, error);
    } catch (dlqError) {
      console.error('Failed to log to DLQ:', dlqError);
    }
  }

  /**
   * Trigger monitoring alert
   */
  private triggerAlert(txHash: string, error: string): void {
    // Placeholder for actual monitoring integration (e.g. Sentry, Datadog, Slack)
    console.error(
      `[ALERT] Blockchain transaction failed permanently: ${txHash}. Error: ${error}`
    );
  }

  /**
   * Sleep utility
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
