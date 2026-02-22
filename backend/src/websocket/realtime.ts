export interface MarketOdds {
  yes: number;
  no: number;
}

export type OddsDirection = 'YES' | 'NO' | 'UNCHANGED';

export interface OddsChangedEvent {
  type: 'odds_changed';
  marketId: string;
  yesOdds: number;
  noOdds: number;
  direction: Exclude<OddsDirection, 'UNCHANGED'>;
  timestamp: number;
}

export interface RealtimeOddsBroadcasterOptions {
  pollIntervalMs?: number;
  significantChangeThresholdPct?: number;
}

export type FetchMarketOdds = (marketId: string) => Promise<MarketOdds>;
export type BroadcastToMarketSubscribers = (
  marketId: string,
  event: OddsChangedEvent
) => Promise<void> | void;

export function hasSignificantChange(
  previousOdds: MarketOdds,
  currentOdds: MarketOdds,
  thresholdPct: number = 1
): boolean {
  const yesChange = relativePercentChange(previousOdds.yes, currentOdds.yes);
  const noChange = relativePercentChange(previousOdds.no, currentOdds.no);
  return Math.max(yesChange, noChange) > thresholdPct;
}

export function getDirection(
  previousOdds: MarketOdds,
  currentOdds: MarketOdds
): OddsDirection {
  if (currentOdds.yes > previousOdds.yes) {
    return 'YES';
  }
  if (currentOdds.yes < previousOdds.yes) {
    return 'NO';
  }
  return 'UNCHANGED';
}

function relativePercentChange(previous: number, current: number): number {
  if (previous === 0) {
    return current === 0 ? 0 : Number.POSITIVE_INFINITY;
  }

  return Math.abs(((current - previous) / previous) * 100);
}

export class RealtimeOddsBroadcaster {
  private readonly pollIntervalMs: number;
  private readonly significantChangeThresholdPct: number;
  private readonly marketSubscribers = new Map<string, Set<string>>();
  private readonly lastPublishedOdds = new Map<string, MarketOdds>();
  private pollTimer?: NodeJS.Timeout;
  private pollInProgress = false;

  constructor(
    private readonly fetchMarketOdds: FetchMarketOdds,
    private readonly broadcastToMarketSubscribers: BroadcastToMarketSubscribers,
    options: RealtimeOddsBroadcasterOptions = {}
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
    this.significantChangeThresholdPct =
      options.significantChangeThresholdPct ?? 1;
  }

  start(): void {
    if (this.pollTimer) {
      return;
    }

    this.pollTimer = setInterval(() => {
      void this.pollAllSubscribedMarkets();
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  subscribe(marketId: string, subscriberId: string): void {
    const subscribers =
      this.marketSubscribers.get(marketId) ?? new Set<string>();
    subscribers.add(subscriberId);
    this.marketSubscribers.set(marketId, subscribers);
  }

  unsubscribe(marketId: string, subscriberId: string): void {
    const subscribers = this.marketSubscribers.get(marketId);
    if (!subscribers) {
      return;
    }

    subscribers.delete(subscriberId);
    if (subscribers.size === 0) {
      this.marketSubscribers.delete(marketId);
      this.lastPublishedOdds.delete(marketId);
    }
  }

  getSubscriberCount(marketId: string): number {
    return this.marketSubscribers.get(marketId)?.size ?? 0;
  }

  async pollAllSubscribedMarkets(): Promise<void> {
    if (this.pollInProgress) {
      return;
    }

    this.pollInProgress = true;
    try {
      const marketIds = [...this.marketSubscribers.keys()];
      await Promise.all(marketIds.map((marketId) => this.pollMarket(marketId)));
    } finally {
      this.pollInProgress = false;
    }
  }

  private async pollMarket(marketId: string): Promise<void> {
    if (this.getSubscriberCount(marketId) === 0) {
      return;
    }

    try {
      const currentOdds = await this.fetchMarketOdds(marketId);
      const previousOdds = this.lastPublishedOdds.get(marketId);

      if (!previousOdds) {
        this.lastPublishedOdds.set(marketId, currentOdds);
        return;
      }

      if (
        !hasSignificantChange(
          previousOdds,
          currentOdds,
          this.significantChangeThresholdPct
        )
      ) {
        return;
      }

      const direction = getDirection(previousOdds, currentOdds);
      if (direction === 'UNCHANGED') {
        return;
      }

      const event: OddsChangedEvent = {
        type: 'odds_changed',
        marketId,
        yesOdds: currentOdds.yes,
        noOdds: currentOdds.no,
        direction,
        timestamp: Date.now(),
      };

      await this.broadcastToMarketSubscribers(marketId, event);
      this.lastPublishedOdds.set(marketId, currentOdds);
    } catch (error) {
      console.error('Realtime odds polling failed', { marketId, error });
    }
  }
}
