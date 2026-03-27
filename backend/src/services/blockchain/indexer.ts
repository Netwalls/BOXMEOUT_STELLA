// backend/src/services/blockchain/indexer.ts
// Blockchain Event Indexer Service - Monitors and syncs blockchain events to database

import { rpc, xdr, scValToNative } from '@stellar/stellar-sdk';
import { BaseBlockchainService } from './base.js';
import { prisma } from '../../database/prisma.js';
import { logger } from '../../utils/logger.js';
import { TradeType, TradeStatus, MarketStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

interface BlockchainEvent {
  type: string;
  contractId: string;
  topics: any[];
  value: any;
  ledger: number;
  txHash: string;
  timestamp: Date;
}

interface IndexerState {
  lastProcessedLedger: number;
  isRunning: boolean;
  lastError?: string;
  eventsProcessed: number;
}

export class BlockchainIndexerService extends BaseBlockchainService {
  private state: IndexerState;
  private pollingInterval: number;
  private pollingTimer?: NodeJS.Timeout;
  private readonly contractAddresses: Map<string, string>;

  constructor() {
    super('BlockchainIndexerService');
    
    this.state = {
      lastProcessedLedger: 0,
      isRunning: false,
      eventsProcessed: 0,
    };

    // Polling interval in milliseconds (default: 5 seconds)
    this.pollingInterval = parseInt(
      process.env.INDEXER_POLLING_INTERVAL || '5000'
    );

    // Map of contract types to addresses
    this.contractAddresses = new Map([
      ['factory', process.env.FACTORY_CONTRACT_ADDRESS || ''],
      ['amm', process.env.AMM_CONTRACT_ADDRESS || ''],
      ['oracle', process.env.ORACLE_CONTRACT_ADDRESS || ''],
      ['treasury', process.env.TREASURY_CONTRACT_ADDRESS || ''],
    ]);

    logger.info('BlockchainIndexerService initialized', {
      pollingInterval: this.pollingInterval,
      contracts: Object.fromEntries(this.contractAddresses),
    });
  }

  /**
   * Start the indexer service
   */
  async start(): Promise<void> {
    if (this.state.isRunning) {
      logger.warn('Indexer already running');
      return;
    }

    logger.info('Starting blockchain indexer service');
    this.state.isRunning = true;

    // Load last processed ledger from database or start from current
    await this.loadLastProcessedLedger();

    // Start polling loop
    this.startPolling();
  }

  /**
   * Stop the indexer service
   */
  async stop(): Promise<void> {
    logger.info('Stopping blockchain indexer service');
    this.state.isRunning = false;

    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = undefined;
    }

    // Save state
    await this.saveLastProcessedLedger();
  }

  /**
   * Get current indexer state
   */
  getState(): IndexerState {
    return { ...this.state };
  }

  /**
   * Load last processed ledger from database
   */
  private async loadLastProcessedLedger(): Promise<void> {
    try {
      // Try to get from audit log or create a dedicated indexer_state table
      const lastLog = await prisma.auditLog.findFirst({
        where: {
          action: 'INDEXER_CHECKPOINT',
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (lastLog && lastLog.newValue) {
        const ledger = (lastLog.newValue as any).ledger;
        this.state.lastProcessedLedger = ledger || 0;
        logger.info('Loaded last processed ledger', { ledger });
      } else {
        // Start from current ledger
        const latestLedger = await this.rpcServer.getLatestLedger();
        this.state.lastProcessedLedger = latestLedger.sequence;
        logger.info('Starting from current ledger', {
          ledger: latestLedger.sequence,
        });
      }
    } catch (error) {
      logger.error('Failed to load last processed ledger', { error });
      // Start from current ledger as fallback
      try {
        const latestLedger = await this.rpcServer.getLatestLedger();
        this.state.lastProcessedLedger = latestLedger.sequence;
      } catch (err) {
        logger.error('Failed to get latest ledger', { error: err });
      }
    }
  }

  /**
   * Save last processed ledger to database
   */
  private async saveLastProcessedLedger(): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          action: 'INDEXER_CHECKPOINT',
          resourceType: 'INDEXER',
          resourceId: 'blockchain-indexer',
          newValue: {
            ledger: this.state.lastProcessedLedger,
            eventsProcessed: this.state.eventsProcessed,
            timestamp: new Date().toISOString(),
          },
          ipAddress: 'system',
          userAgent: 'BlockchainIndexerService',
        },
      });
    } catch (error) {
      logger.error('Failed to save indexer checkpoint', { error });
    }
  }

  /**
   * Start polling for new events
   */
  private startPolling(): void {
    const poll = async () => {
      if (!this.state.isRunning) {
        return;
      }

      try {
        await this.processNewLedgers();
      } catch (error) {
        logger.error('Error in polling loop', { error });
        this.state.lastError = error instanceof Error ? error.message : 'Unknown error';
      }

      // Schedule next poll
      if (this.state.isRunning) {
        this.pollingTimer = setTimeout(poll, this.pollingInterval);
      }
    };

    // Start first poll
    poll();
  }

  /**
   * Process new ledgers since last checkpoint
   */
  private async processNewLedgers(): Promise<void> {
    try {
      const latestLedger = await this.rpcServer.getLatestLedger();
      const currentLedger = latestLedger.sequence;

      if (currentLedger <= this.state.lastProcessedLedger) {
        // No new ledgers
        return;
      }

      // Process ledgers in batches to avoid overwhelming the system
      const batchSize = 10;
      const startLedger = this.state.lastProcessedLedger + 1;
      const endLedger = Math.min(startLedger + batchSize - 1, currentLedger);

      logger.info('Processing ledgers', { startLedger, endLedger });

      for (let ledger = startLedger; ledger <= endLedger; ledger++) {
        await this.processLedger(ledger);
        this.state.lastProcessedLedger = ledger;
      }

      // Save checkpoint every 10 ledgers
      if (this.state.lastProcessedLedger % 10 === 0) {
        await this.saveLastProcessedLedger();
      }
    } catch (error) {
      logger.error('Failed to process new ledgers', { error });
      throw error;
    }
  }

  /**
   * Process a single ledger
   */
  private async processLedger(ledgerSeq: number): Promise<void> {
    try {
      // Get events for this ledger
      const events = await this.getEventsForLedger(ledgerSeq);

      if (events.length === 0) {
        return;
      }

      logger.info('Processing events', {
        ledger: ledgerSeq,
        eventCount: events.length,
      });

      // Process each event
      for (const event of events) {
        await this.processEvent(event);
        this.state.eventsProcessed++;
      }
    } catch (error) {
      logger.error('Failed to process ledger', { ledger: ledgerSeq, error });
      // Continue processing next ledgers even if one fails
    }
  }

  /**
   * Get events for a specific ledger
   */
  private async getEventsForLedger(
    ledgerSeq: number
  ): Promise<BlockchainEvent[]> {
    const events: BlockchainEvent[] = [];

    try {
      // Query events for each contract
      for (const [contractType, contractId] of this.contractAddresses) {
        if (!contractId) {
          continue;
        }

        const contractEvents = await this.rpcServer.getEvents({
          startLedger: ledgerSeq,
          filters: [
            {
              type: 'contract',
              contractIds: [contractId],
            },
          ],
        });

        // Parse and add events
        for (const event of contractEvents.events || []) {
          try {
            const parsedEvent = this.parseEvent(event, contractType);
            if (parsedEvent) {
              events.push(parsedEvent);
            }
          } catch (error) {
            logger.warn('Failed to parse event', { event, error });
          }
        }
      }
    } catch (error) {
      logger.error('Failed to get events for ledger', {
        ledger: ledgerSeq,
        error,
      });
    }

    return events;
  }

  /**
   * Parse a raw blockchain event
   */
  private parseEvent(
    rawEvent: any,
    contractType: string
  ): BlockchainEvent | null {
    try {
      const event = rawEvent as rpc.Api.EventResponse;
      
      // Parse topics and value
      const topics = event.topic.map((topic: string) => {
        try {
          const scVal = xdr.ScVal.fromXDR(topic, 'base64');
          return scValToNative(scVal);
        } catch {
          return topic;
        }
      });

      let value: any;
      try {
        const scVal = xdr.ScVal.fromXDR(event.value, 'base64');
        value = scValToNative(scVal);
      } catch {
        value = event.value;
      }

      // Determine event type from topics
      const eventType = topics[0] || 'unknown';

      return {
        type: eventType,
        contractId: event.contractId,
        topics,
        value,
        ledger: event.ledger,
        txHash: event.txHash,
        timestamp: new Date(event.ledgerClosedAt),
      };
    } catch (error) {
      logger.error('Failed to parse event', { error });
      return null;
    }
  }

  /**
   * Process a blockchain event
   */
  private async processEvent(event: BlockchainEvent): Promise<void> {
    try {
      logger.info('Processing event', {
        type: event.type,
        ledger: event.ledger,
        txHash: event.txHash,
      });

      // Route to appropriate handler based on event type
      switch (event.type) {
        case 'market_created':
          await this.handleMarketCreated(event);
          break;
        case 'pool_created':
          await this.handlePoolCreated(event);
          break;
        case 'shares_bought':
          await this.handleSharesBought(event);
          break;
        case 'shares_sold':
          await this.handleSharesSold(event);
          break;
        case 'market_resolved':
          await this.handleMarketResolved(event);
          break;
        case 'attestation_submitted':
          await this.handleAttestationSubmitted(event);
          break;
        case 'distribution_executed':
          await this.handleDistributionExecuted(event);
          break;
        default:
          logger.debug('Unhandled event type', { type: event.type });
      }
    } catch (error) {
      logger.error('Failed to process event', {
        event,
        error,
      });
      // Log to DLQ for manual review
      await this.logEventToDLQ(event, error);
    }
  }

  /**
   * Handle market_created event
   */
  private async handleMarketCreated(event: BlockchainEvent): Promise<void> {
    const { value } = event;
    
    // Update market with blockchain confirmation
    await prisma.market.updateMany({
      where: {
        contractAddress: value.marketId,
        status: MarketStatus.OPEN,
      },
      data: {
        updatedAt: event.timestamp,
      },
    });

    logger.info('Market created event processed', {
      marketId: value.marketId,
      txHash: event.txHash,
    });
  }

  /**
   * Handle pool_created event
   */
  private async handlePoolCreated(event: BlockchainEvent): Promise<void> {
    const { value } = event;

    await prisma.market.updateMany({
      where: {
        contractAddress: value.marketId,
      },
      data: {
        yesLiquidity: new Decimal(value.yesReserve || 0),
        noLiquidity: new Decimal(value.noReserve || 0),
        poolTxHash: event.txHash,
        updatedAt: event.timestamp,
      },
    });

    logger.info('Pool created event processed', {
      marketId: value.marketId,
      txHash: event.txHash,
    });
  }

  /**
   * Handle shares_bought event
   */
  private async handleSharesBought(event: BlockchainEvent): Promise<void> {
    const { value } = event;

    // Confirm trade in database
    await prisma.trade.updateMany({
      where: {
        txHash: event.txHash,
        tradeType: TradeType.BUY,
        status: TradeStatus.PENDING,
      },
      data: {
        status: TradeStatus.CONFIRMED,
        confirmedAt: event.timestamp,
        updatedAt: event.timestamp,
      },
    });

    // Update market volume
    await prisma.market.updateMany({
      where: {
        contractAddress: value.marketId,
      },
      data: {
        totalVolume: {
          increment: new Decimal(value.totalCost || 0),
        },
        updatedAt: event.timestamp,
      },
    });

    logger.info('Shares bought event processed', {
      marketId: value.marketId,
      buyer: value.buyer,
      shares: value.shares,
      txHash: event.txHash,
    });
  }

  /**
   * Handle shares_sold event
   */
  private async handleSharesSold(event: BlockchainEvent): Promise<void> {
    const { value } = event;

    // Confirm trade in database
    await prisma.trade.updateMany({
      where: {
        txHash: event.txHash,
        tradeType: TradeType.SELL,
        status: TradeStatus.PENDING,
      },
      data: {
        status: TradeStatus.CONFIRMED,
        confirmedAt: event.timestamp,
        updatedAt: event.timestamp,
      },
    });

    logger.info('Shares sold event processed', {
      marketId: value.marketId,
      seller: value.seller,
      shares: value.shares,
      txHash: event.txHash,
    });
  }

  /**
   * Handle market_resolved event
   */
  private async handleMarketResolved(event: BlockchainEvent): Promise<void> {
    const { value } = event;

    await prisma.market.updateMany({
      where: {
        contractAddress: value.marketId,
        status: MarketStatus.CLOSED,
      },
      data: {
        status: MarketStatus.RESOLVED,
        winningOutcome: value.outcome,
        resolvedAt: event.timestamp,
        updatedAt: event.timestamp,
      },
    });

    logger.info('Market resolved event processed', {
      marketId: value.marketId,
      outcome: value.outcome,
      txHash: event.txHash,
    });
  }

  /**
   * Handle attestation_submitted event
   */
  private async handleAttestationSubmitted(
    event: BlockchainEvent
  ): Promise<void> {
    const { value } = event;

    // Find market by contract address
    const market = await prisma.market.findUnique({
      where: {
        contractAddress: value.marketId,
      },
    });

    if (!market) {
      logger.warn('Market not found for attestation', {
        marketId: value.marketId,
      });
      return;
    }

    // Create or update attestation
    await prisma.attestation.upsert({
      where: {
        marketId_oracleId: {
          marketId: market.id,
          oracleId: value.oracleId,
        },
      },
      create: {
        marketId: market.id,
        oracleId: value.oracleId,
        outcome: value.outcome,
        txHash: event.txHash,
      },
      update: {
        outcome: value.outcome,
        txHash: event.txHash,
      },
    });

    // Update attestation count
    await prisma.market.update({
      where: { id: market.id },
      data: {
        attestationCount: {
          increment: 1,
        },
      },
    });

    logger.info('Attestation submitted event processed', {
      marketId: value.marketId,
      oracleId: value.oracleId,
      outcome: value.outcome,
      txHash: event.txHash,
    });
  }

  /**
   * Handle distribution_executed event
   */
  private async handleDistributionExecuted(
    event: BlockchainEvent
  ): Promise<void> {
    const { value } = event;

    await prisma.distribution.updateMany({
      where: {
        txHash: event.txHash,
      },
      data: {
        status: 'CONFIRMED',
        completedAt: event.timestamp,
      },
    });

    logger.info('Distribution executed event processed', {
      distributionType: value.distributionType,
      amount: value.amount,
      txHash: event.txHash,
    });
  }

  /**
   * Log failed event to DLQ for manual review
   */
  private async logEventToDLQ(
    event: BlockchainEvent,
    error: any
  ): Promise<void> {
    try {
      await prisma.blockchainDeadLetterQueue.create({
        data: {
          txHash: event.txHash,
          serviceName: 'BlockchainIndexerService',
          functionName: `processEvent:${event.type}`,
          params: {
            event,
          },
          error: error instanceof Error ? error.message : String(error),
          status: 'PENDING',
        },
      });
    } catch (dlqError) {
      logger.error('Failed to log event to DLQ', { dlqError });
    }
  }

  /**
   * Manually reprocess events from a specific ledger
   */
  async reprocessFromLedger(startLedger: number): Promise<void> {
    logger.info('Manually reprocessing from ledger', { startLedger });
    
    const wasRunning = this.state.isRunning;
    if (wasRunning) {
      await this.stop();
    }

    this.state.lastProcessedLedger = startLedger - 1;
    
    if (wasRunning) {
      await this.start();
    }
  }

  /**
   * Get indexer statistics
   */
  async getStatistics(): Promise<{
    state: IndexerState;
    latestLedger: number;
    ledgersBehind: number;
  }> {
    const latestLedger = await this.rpcServer.getLatestLedger();
    
    return {
      state: this.getState(),
      latestLedger: latestLedger.sequence,
      ledgersBehind: latestLedger.sequence - this.state.lastProcessedLedger,
    };
  }
}

export const indexerService = new BlockchainIndexerService();
