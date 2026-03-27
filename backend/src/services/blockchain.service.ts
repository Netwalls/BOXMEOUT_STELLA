/**
 * blockchain.service.ts
 *
 * Background event-listener that polls Stellar/Soroban for on-chain contract
 * events and syncs state to the database.
 *
 * Handled events
 *   shares_bought       → confirm Trade (BUY), update market volume & liquidity
 *   shares_sold         → confirm Trade (SELL), update market liquidity
 *   market_finalized    → resolve Market, settle Predictions, notify participants
 *   outcome_disputed    → open Dispute record, set market status DISPUTED
 *   position_redeemed   → mark Share position redeemed, notify user
 *
 * Guarantees
 *   • Idempotent  – processed events are recorded; replaying has no effect.
 *   • Retry       – each event is retried up to MAX_EVENT_RETRIES (3) times
 *                   with exponential back-off before being sent to the DLQ.
 *   • Errors      – every failure is logged; the loop continues for other events.
 */

import { rpc, xdr, scValToNative } from '@stellar/stellar-sdk';
import { prisma } from '../database/prisma.js';
import { logger } from '../utils/logger.js';
import {
  TradeType,
  TradeStatus,
  MarketStatus,
  DisputeStatus,
  NotificationType,
  PredictionStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { notificationService } from './notification.service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContractEvent {
  /** Normalised event name, e.g. "shares_bought" */
  type: string;
  contractId: string;
  /** Decoded topic array (index 0 is the event name symbol) */
  topics: unknown[];
  /** Decoded value map from the contract */
  value: Record<string, unknown>;
  ledger: number;
  txHash: string;
  timestamp: Date;
}

interface EventSyncConfig {
  /** Soroban RPC URL */
  rpcUrl: string;
  /** Contract addresses to watch */
  contractIds: string[];
  /** Polling interval in ms (default 10 000) */
  pollingIntervalMs: number;
  /** Max per-event retry attempts before DLQ (default 3) */
  maxRetries: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_EVENT_RETRIES = 3;
const LEDGER_BATCH_SIZE = 20;
const CHECKPOINT_ACTION = 'BLOCKCHAIN_SERVICE_CHECKPOINT';

// ---------------------------------------------------------------------------
// BlockchainEventService
// ---------------------------------------------------------------------------

export class BlockchainEventService {
  private readonly rpcServer: rpc.Server;
  private readonly config: EventSyncConfig;

  private isRunning = false;
  private lastProcessedLedger = 0;
  private eventsProcessed = 0;
  private pollingTimer?: NodeJS.Timeout;

  constructor(cfg?: Partial<EventSyncConfig>) {
    const rpcUrl =
      cfg?.rpcUrl ||
      process.env.STELLAR_SOROBAN_RPC_URL ||
      'https://soroban-testnet.stellar.org';

    this.rpcServer = new rpc.Server(rpcUrl, {
      allowHttp: rpcUrl.startsWith('http://'),
    });

    // Collect all configured contract addresses (skip empty strings)
    const contractIds = (
      cfg?.contractIds ?? [
        process.env.AMM_CONTRACT_ADDRESS,
        process.env.FACTORY_CONTRACT_ADDRESS,
        process.env.ORACLE_CONTRACT_ADDRESS,
        process.env.TREASURY_CONTRACT_ADDRESS,
        process.env.MARKET_CONTRACT_ADDRESS,
      ]
    ).filter((id): id is string => Boolean(id));

    this.config = {
      rpcUrl,
      contractIds,
      pollingIntervalMs:
        cfg?.pollingIntervalMs ??
        parseInt(process.env.INDEXER_POLLING_INTERVAL ?? '10000', 10),
      maxRetries: cfg?.maxRetries ?? MAX_EVENT_RETRIES,
    };

    logger.info('BlockchainEventService created', {
      contracts: this.config.contractIds,
      pollingIntervalMs: this.config.pollingIntervalMs,
    });
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('BlockchainEventService already running');
      return;
    }
    this.isRunning = true;
    await this.loadCheckpoint();
    logger.info('BlockchainEventService started', {
      fromLedger: this.lastProcessedLedger,
    });
    this.scheduleNextPoll();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = undefined;
    }
    await this.saveCheckpoint();
    logger.info('BlockchainEventService stopped', {
      eventsProcessed: this.eventsProcessed,
      lastLedger: this.lastProcessedLedger,
    });
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      lastProcessedLedger: this.lastProcessedLedger,
      eventsProcessed: this.eventsProcessed,
    };
  }

  // -------------------------------------------------------------------------
  // Polling loop
  // -------------------------------------------------------------------------

  private scheduleNextPoll(): void {
    if (!this.isRunning) return;
    this.pollingTimer = setTimeout(async () => {
      try {
        await this.poll();
      } catch (err) {
        logger.error('BlockchainEventService poll error', { err });
      }
      this.scheduleNextPoll();
    }, this.config.pollingIntervalMs);
  }

  private async poll(): Promise<void> {
    if (this.config.contractIds.length === 0) {
      logger.debug(
        'BlockchainEventService: no contract IDs configured, skipping poll'
      );
      return;
    }

    const latest = await this.rpcServer.getLatestLedger();
    const latestSeq = latest.sequence;

    if (latestSeq <= this.lastProcessedLedger) return;

    const start = this.lastProcessedLedger + 1;
    const end = Math.min(start + LEDGER_BATCH_SIZE - 1, latestSeq);

    logger.debug('BlockchainEventService polling', { start, end });

    const events = await this.fetchEvents(start, end);

    for (const event of events) {
      await this.processWithRetry(event);
    }

    this.lastProcessedLedger = end;

    // Persist checkpoint every batch
    await this.saveCheckpoint();
  }

  // -------------------------------------------------------------------------
  // Event fetching
  // -------------------------------------------------------------------------

  private async fetchEvents(
    startLedger: number,
    endLedger: number
  ): Promise<ContractEvent[]> {
    const results: ContractEvent[] = [];

    try {
      const response = await this.rpcServer.getEvents({
        startLedger,
        filters: [
          {
            type: 'contract',
            contractIds: this.config.contractIds,
          },
        ],
      });

      for (const raw of response.events ?? []) {
        // Only process ledgers in our window
        if (raw.ledger > endLedger) continue;

        const parsed = this.parseRawEvent(raw);
        if (parsed) results.push(parsed);
      }
    } catch (err) {
      logger.error('BlockchainEventService: failed to fetch events', {
        startLedger,
        endLedger,
        err,
      });
    }

    return results;
  }

  private parseRawEvent(raw: rpc.Api.EventResponse): ContractEvent | null {
    try {
      // raw.topic is xdr.ScVal[] — cast to any[] to decode each entry
      const topics = ((raw.topic as any[]) ?? []).map((t: any) => {
        try {
          // If already an ScVal object, decode directly; otherwise treat as base64 string
          const scVal: xdr.ScVal =
            typeof t === 'string'
              ? xdr.ScVal.fromXDR(t as string, 'base64')
              : (t as xdr.ScVal);
          return scValToNative(scVal);
        } catch {
          return t;
        }
      });

      let value: Record<string, unknown> = {};
      try {
        // raw.value is xdr.ScVal | string depending on SDK version
        const scVal: xdr.ScVal =
          typeof raw.value === 'string'
            ? xdr.ScVal.fromXDR(raw.value as string, 'base64')
            : (raw.value as unknown as xdr.ScVal);
        const decoded = scValToNative(scVal);
        value = (
          typeof decoded === 'object' && decoded !== null
            ? decoded
            : { raw: decoded }
        ) as Record<string, unknown>;
      } catch {
        value = { raw: String(raw.value) };
      }

      // The first topic is the event name symbol emitted by the contract
      const type = String(topics[0] ?? 'unknown');

      return {
        type,
        contractId: String(raw.contractId ?? ''),
        topics,
        value,
        ledger: raw.ledger,
        txHash: raw.txHash,
        timestamp: new Date(raw.ledgerClosedAt),
      };
    } catch (err) {
      logger.warn('BlockchainEventService: could not parse raw event', {
        raw,
        err,
      });
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Retry wrapper
  // -------------------------------------------------------------------------

  private async processWithRetry(event: ContractEvent): Promise<void> {
    let attempt = 0;
    let delayMs = 500;

    while (attempt < this.config.maxRetries) {
      try {
        await this.routeEvent(event);
        this.eventsProcessed++;
        return;
      } catch (err) {
        attempt++;
        logger.warn('BlockchainEventService: event processing failed', {
          type: event.type,
          txHash: event.txHash,
          attempt,
          maxRetries: this.config.maxRetries,
          err,
        });

        if (attempt >= this.config.maxRetries) {
          logger.error(
            'BlockchainEventService: max retries reached, sending to DLQ',
            {
              type: event.type,
              txHash: event.txHash,
            }
          );
          await this.sendToDLQ(event, err);
          return;
        }

        await this.sleep(delayMs);
        delayMs *= 2; // exponential back-off: 500 → 1000 → 2000
      }
    }
  }

  // -------------------------------------------------------------------------
  // Event router
  // -------------------------------------------------------------------------

  private async routeEvent(event: ContractEvent): Promise<void> {
    // Idempotency guard — skip already-processed events
    if (await this.isAlreadyProcessed(event.txHash, event.type)) {
      logger.debug('BlockchainEventService: skipping already-processed event', {
        txHash: event.txHash,
        type: event.type,
      });
      return;
    }

    logger.info('BlockchainEventService: processing event', {
      type: event.type,
      ledger: event.ledger,
      txHash: event.txHash,
    });

    switch (event.type) {
      case 'shares_bought':
        await this.handleSharesBought(event);
        break;
      case 'shares_sold':
        await this.handleSharesSold(event);
        break;
      case 'market_finalized':
        await this.handleMarketFinalized(event);
        break;
      case 'outcome_disputed':
        await this.handleOutcomeDisputed(event);
        break;
      case 'position_redeemed':
        await this.handlePositionRedeemed(event);
        break;
      default:
        logger.debug('BlockchainEventService: unhandled event type', {
          type: event.type,
        });
        return; // Don't mark unknown events as processed
    }

    // Mark as processed after successful handling
    await this.markProcessed(event.txHash, event.type);
  }

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  /**
   * shares_bought
   * Expected value: { market_id, buyer, outcome, shares_received, total_cost, fee_amount, price_per_unit }
   */
  private async handleSharesBought(event: ContractEvent): Promise<void> {
    const v = event.value;
    const marketContractAddress = String(v.market_id ?? v.marketId ?? '');
    const totalCost = Number(v.total_cost ?? v.totalCost ?? 0);
    const feeAmount = Number(v.fee_amount ?? v.feeAmount ?? 0);

    // Confirm any pending BUY trade with this txHash
    await prisma.trade.updateMany({
      where: {
        txHash: event.txHash,
        tradeType: TradeType.BUY,
        status: TradeStatus.PENDING,
      },
      data: { status: TradeStatus.CONFIRMED, confirmedAt: event.timestamp },
    });

    // Update market volume and liquidity
    if (marketContractAddress) {
      const outcome = Number(v.outcome ?? 0);
      const sharesReceived = Number(v.shares_received ?? v.sharesReceived ?? 0);

      await prisma.market.updateMany({
        where: { contractAddress: marketContractAddress },
        data: {
          totalVolume: { increment: new Decimal(totalCost) },
          feesCollected: { increment: new Decimal(feeAmount) },
          // Increment the appropriate liquidity side
          ...(outcome === 1
            ? { yesLiquidity: { increment: new Decimal(sharesReceived) } }
            : { noLiquidity: { increment: new Decimal(sharesReceived) } }),
        },
      });
    }

    logger.info('shares_bought processed', {
      txHash: event.txHash,
      marketContractAddress,
      totalCost,
    });
  }

  /**
   * shares_sold
   * Expected value: { market_id, seller, outcome, shares_sold, payout, fee_amount, price_per_unit }
   */
  private async handleSharesSold(event: ContractEvent): Promise<void> {
    const v = event.value;
    const marketContractAddress = String(v.market_id ?? v.marketId ?? '');
    const outcome = Number(v.outcome ?? 0);
    const sharesSold = Number(v.shares_sold ?? v.sharesSold ?? 0);
    const feeAmount = Number(v.fee_amount ?? v.feeAmount ?? 0);

    // Confirm any pending SELL trade
    await prisma.trade.updateMany({
      where: {
        txHash: event.txHash,
        tradeType: TradeType.SELL,
        status: TradeStatus.PENDING,
      },
      data: { status: TradeStatus.CONFIRMED, confirmedAt: event.timestamp },
    });

    // Reduce liquidity on the sold side
    if (marketContractAddress && sharesSold > 0) {
      await prisma.market.updateMany({
        where: { contractAddress: marketContractAddress },
        data: {
          feesCollected: { increment: new Decimal(feeAmount) },
          ...(outcome === 1
            ? { yesLiquidity: { decrement: new Decimal(sharesSold) } }
            : { noLiquidity: { decrement: new Decimal(sharesSold) } }),
        },
      });
    }

    logger.info('shares_sold processed', {
      txHash: event.txHash,
      marketContractAddress,
      sharesSold,
    });
  }

  /**
   * market_finalized
   * Expected value: { market_id, winning_outcome, resolution_source }
   *
   * Resolves the market, settles all revealed predictions, and notifies participants.
   */
  private async handleMarketFinalized(event: ContractEvent): Promise<void> {
    const v = event.value;
    const marketContractAddress = String(v.market_id ?? v.marketId ?? '');
    const winningOutcome = Number(
      v.winning_outcome ?? v.winningOutcome ?? v.outcome ?? 0
    );
    const resolutionSource = String(
      v.resolution_source ?? v.resolutionSource ?? 'blockchain'
    );

    const market = await prisma.market.findUnique({
      where: { contractAddress: marketContractAddress },
      include: {
        predictions: { where: { status: PredictionStatus.REVEALED } },
      },
    });

    if (!market) {
      logger.warn('market_finalized: market not found', {
        marketContractAddress,
      });
      return;
    }

    // Idempotent: skip if already resolved
    if (market.status === MarketStatus.RESOLVED) {
      logger.debug('market_finalized: market already resolved', {
        marketId: market.id,
      });
      return;
    }

    // Resolve market
    await prisma.market.update({
      where: { id: market.id },
      data: {
        status: MarketStatus.RESOLVED,
        winningOutcome,
        resolvedAt: event.timestamp,
        resolutionSource,
      },
    });

    // Settle revealed predictions
    const userIds = new Set<string>();
    for (const prediction of market.predictions) {
      const isWinner = prediction.predictedOutcome === winningOutcome;
      const pnlUsd = isWinner
        ? Number(prediction.amountUsdc) * 0.9 // 90% return (10% platform fee)
        : -Number(prediction.amountUsdc);

      await prisma.prediction.update({
        where: { id: prediction.id },
        data: {
          status: PredictionStatus.SETTLED,
          isWinner,
          pnlUsd: new Decimal(pnlUsd),
          settledAt: event.timestamp,
        },
      });

      userIds.add(prediction.userId);

      // Notify each participant (fire-and-forget, non-blocking)
      notificationService
        .notifyPredictionResult(
          prediction.userId,
          market.title,
          isWinner,
          Math.abs(pnlUsd)
        )
        .catch((err) =>
          logger.error('market_finalized: notification failed', {
            userId: prediction.userId,
            err,
          })
        );
    }

    // Notify all participants about market resolution
    const outcomeLabel =
      winningOutcome === 1
        ? (market.outcomeA ?? 'YES')
        : (market.outcomeB ?? 'NO');
    for (const userId of userIds) {
      notificationService
        .notifyMarketResolution(userId, market.title, outcomeLabel)
        .catch((err) =>
          logger.error(
            'market_finalized: market resolution notification failed',
            { userId, err }
          )
        );
    }

    logger.info('market_finalized processed', {
      marketId: market.id,
      winningOutcome,
      settledPredictions: market.predictions.length,
    });
  }

  /**
   * outcome_disputed
   * Expected value: { market_id, disputer, reason }
   *
   * Creates a Dispute record and sets the market to DISPUTED status.
   */
  private async handleOutcomeDisputed(event: ContractEvent): Promise<void> {
    const v = event.value;
    const marketContractAddress = String(v.market_id ?? v.marketId ?? '');
    const disputerAddress = String(v.disputer ?? v.user ?? '');
    const reason = String(v.reason ?? 'On-chain dispute raised');

    const market = await prisma.market.findUnique({
      where: { contractAddress: marketContractAddress },
    });

    if (!market) {
      logger.warn('outcome_disputed: market not found', {
        marketContractAddress,
      });
      return;
    }

    // Find the user by wallet address (may not exist if disputer is external)
    const user = disputerAddress
      ? await prisma.user.findFirst({
          where: { walletAddress: disputerAddress },
        })
      : null;

    // Upsert dispute — idempotent on txHash stored in evidenceUrl
    const existingDispute = await prisma.dispute.findFirst({
      where: { marketId: market.id, evidenceUrl: event.txHash },
    });

    if (!existingDispute) {
      await prisma.dispute.create({
        data: {
          marketId: market.id,
          userId: user?.id ?? market.creatorId, // fallback to creator if user unknown
          reason,
          evidenceUrl: event.txHash, // use txHash as evidence reference
          status: DisputeStatus.OPEN,
        },
      });
    }

    // Set market to DISPUTED
    if (market.status !== MarketStatus.DISPUTED) {
      await prisma.market.update({
        where: { id: market.id },
        data: { status: MarketStatus.DISPUTED },
      });
    }

    // Notify market creator
    notificationService
      .createNotification(
        market.creatorId,
        NotificationType.SYSTEM,
        '⚠️ Market Outcome Disputed',
        `The outcome of your market "${market.title}" has been disputed on-chain. An admin will review it.`,
        { marketId: market.id, txHash: event.txHash, disputer: disputerAddress }
      )
      .catch((err) =>
        logger.error('outcome_disputed: notification failed', { err })
      );

    logger.info('outcome_disputed processed', {
      marketId: market.id,
      disputer: disputerAddress,
      txHash: event.txHash,
    });
  }

  /**
   * position_redeemed
   * Expected value: { market_id, redeemer, outcome, shares_redeemed, payout }
   *
   * Marks the user's share position as fully redeemed and notifies them.
   */
  private async handlePositionRedeemed(event: ContractEvent): Promise<void> {
    const v = event.value;
    const marketContractAddress = String(v.market_id ?? v.marketId ?? '');
    const redeemerAddress = String(v.redeemer ?? v.user ?? '');
    const outcome = Number(v.outcome ?? 0);
    const payout = Number(v.payout ?? 0);

    const market = await prisma.market.findUnique({
      where: { contractAddress: marketContractAddress },
    });

    if (!market) {
      logger.warn('position_redeemed: market not found', {
        marketContractAddress,
      });
      return;
    }

    const user = redeemerAddress
      ? await prisma.user.findFirst({
          where: { walletAddress: redeemerAddress },
        })
      : null;

    if (user) {
      // Mark the share position as fully sold/redeemed
      const share = await prisma.share.findFirst({
        where: { userId: user.id, marketId: market.id, outcome },
      });

      if (share) {
        const qty = Number(share.quantity);
        await prisma.share.update({
          where: { id: share.id },
          data: {
            soldQuantity: { increment: qty },
            quantity: 0,
            soldAt: event.timestamp,
            realizedPnl: new Decimal(payout - Number(share.costBasis)),
            currentValue: new Decimal(0),
            unrealizedPnl: new Decimal(0),
          },
        });
      }

      // Mark winning prediction as claimed if applicable
      await prisma.prediction.updateMany({
        where: {
          userId: user.id,
          marketId: market.id,
          status: PredictionStatus.SETTLED,
          isWinner: true,
          winningsClaimed: false,
        },
        data: { winningsClaimed: true },
      });

      // Notify user
      notificationService
        .notifyWinningsAvailable(user.id, market.title, payout)
        .catch((err) =>
          logger.error('position_redeemed: notification failed', {
            userId: user.id,
            err,
          })
        );
    }

    logger.info('position_redeemed processed', {
      marketId: market.id,
      redeemer: redeemerAddress,
      payout,
      txHash: event.txHash,
    });
  }

  // -------------------------------------------------------------------------
  // Idempotency helpers
  // -------------------------------------------------------------------------

  /**
   * Returns true if this (txHash, eventType) pair has already been processed.
   * We store processed events in the AuditLog with action = 'BLOCKCHAIN_EVENT_PROCESSED'.
   */
  private async isAlreadyProcessed(
    txHash: string,
    eventType: string
  ): Promise<boolean> {
    const existing = await prisma.auditLog.findFirst({
      where: {
        action: 'BLOCKCHAIN_EVENT_PROCESSED',
        resourceType: eventType,
        resourceId: txHash,
      },
    });
    return existing !== null;
  }

  private async markProcessed(
    txHash: string,
    eventType: string
  ): Promise<void> {
    await prisma.auditLog.create({
      data: {
        action: 'BLOCKCHAIN_EVENT_PROCESSED',
        resourceType: eventType,
        resourceId: txHash,
        newValue: { processedAt: new Date().toISOString() },
        ipAddress: 'system',
        userAgent: 'BlockchainEventService',
      },
    });
  }

  // -------------------------------------------------------------------------
  // Checkpoint persistence
  // -------------------------------------------------------------------------

  private async loadCheckpoint(): Promise<void> {
    try {
      const record = await prisma.auditLog.findFirst({
        where: { action: CHECKPOINT_ACTION },
        orderBy: { createdAt: 'desc' },
      });

      if (record?.newValue) {
        const ledger = (record.newValue as Record<string, unknown>).ledger;
        if (typeof ledger === 'number') {
          this.lastProcessedLedger = ledger;
          logger.info('BlockchainEventService: checkpoint loaded', { ledger });
          return;
        }
      }

      // No checkpoint — start from current ledger
      const latest = await this.rpcServer.getLatestLedger();
      this.lastProcessedLedger = latest.sequence;
      logger.info(
        'BlockchainEventService: no checkpoint, starting from current ledger',
        {
          ledger: this.lastProcessedLedger,
        }
      );
    } catch (err) {
      logger.error('BlockchainEventService: failed to load checkpoint', {
        err,
      });
      try {
        const latest = await this.rpcServer.getLatestLedger();
        this.lastProcessedLedger = latest.sequence;
      } catch {
        // leave at 0 — will catch up from genesis (not ideal but safe)
      }
    }
  }

  private async saveCheckpoint(): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          action: CHECKPOINT_ACTION,
          resourceType: 'BLOCKCHAIN_EVENT_SERVICE',
          resourceId: 'checkpoint',
          newValue: {
            ledger: this.lastProcessedLedger,
            eventsProcessed: this.eventsProcessed,
            savedAt: new Date().toISOString(),
          },
          ipAddress: 'system',
          userAgent: 'BlockchainEventService',
        },
      });
    } catch (err) {
      logger.error('BlockchainEventService: failed to save checkpoint', {
        err,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Dead-letter queue
  // -------------------------------------------------------------------------

  private async sendToDLQ(event: ContractEvent, err: unknown): Promise<void> {
    try {
      await prisma.blockchainDeadLetterQueue.upsert({
        where: { txHash: `${event.txHash}:${event.type}` },
        create: {
          txHash: `${event.txHash}:${event.type}`,
          serviceName: 'BlockchainEventService',
          functionName: `handleEvent:${event.type}`,
          params: {
            type: event.type,
            contractId: event.contractId,
            ledger: event.ledger,
            txHash: event.txHash,
            timestamp: event.timestamp.toISOString(),
            value: event.value as Record<
              string,
              string | number | boolean | null
            >,
          },
          error: err instanceof Error ? err.message : String(err),
          status: 'FAILED',
        },
        update: {
          retryCount: { increment: 1 },
          error: err instanceof Error ? err.message : String(err),
          lastRetryAt: new Date(),
        },
      });
    } catch (dlqErr) {
      logger.error('BlockchainEventService: failed to write to DLQ', {
        dlqErr,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Utility
  // -------------------------------------------------------------------------

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton
export const blockchainEventService = new BlockchainEventService();
export default blockchainEventService;
