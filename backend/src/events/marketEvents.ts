import { EventEmitter } from "events";

export type MarketEventType =
  | "bet_placed"
  | "market_resolved"
  | "pool_updated"
  | "status_changed";

export interface MarketEventPayload {
  marketId: string;
  type: MarketEventType;
  data: Record<string, unknown>;
}

// Shared bus: indexer event handlers publish here, and the SSE endpoint
// subscribes per marketId — both sides consume the same event stream.
export const marketEventBus = new EventEmitter();
marketEventBus.setMaxListeners(0);

function channel(marketId: string): string {
  return `market:${marketId}`;
}

export function publishMarketEvent(
  marketId: string,
  type: MarketEventType,
  data: Record<string, unknown>,
): void {
  const payload: MarketEventPayload = { marketId, type, data };
  marketEventBus.emit(channel(marketId), payload);
}

export function subscribeToMarket(
  marketId: string,
  listener: (payload: MarketEventPayload) => void,
): () => void {
  marketEventBus.on(channel(marketId), listener);
  return () => marketEventBus.off(channel(marketId), listener);
}

// Redis pub/sub fan-out so events published on one instance reach SSE
// subscribers connected to any other instance. The publisher/subscriber
// clients are injected to avoid a hard dependency on a specific Redis setup.
export interface MarketEventRedisClients {
  publisher: { publish(channel: string, message: string): Promise<unknown> };
  subscriber: {
    subscribe(channel: string): Promise<unknown>;
    unsubscribe(channel: string): Promise<unknown>;
    on(event: "message", listener: (channel: string, message: string) => void): unknown;
    off(event: "message", listener: (channel: string, message: string) => void): unknown;
  };
}

let redisClients: MarketEventRedisClients | null = null;

// Wire the Redis clients used for cross-instance delivery. Call once at
// startup; passing null disables the Redis fan-out (single-instance mode).
export function configureMarketEventRedis(clients: MarketEventRedisClients | null): void {
  redisClients = clients;
}

function redisChannel(marketId: string): string {
  return `market-events:${marketId}`;
}

// Publish locally and, when Redis is configured, fan out to other instances.
export function publishMarketEventDistributed(
  marketId: string,
  type: MarketEventType,
  data: Record<string, unknown>,
): void {
  publishMarketEvent(marketId, type, data);
  if (redisClients) {
    const payload: MarketEventPayload = { marketId, type, data };
    void redisClients.publisher.publish(redisChannel(marketId), JSON.stringify(payload));
  }
}

// Subscribe to a market's events from both the local bus and Redis. Returns a
// cleanup function that removes the local listener and the Redis subscription.
export function subscribeToMarketDistributed(
  marketId: string,
  listener: (payload: MarketEventPayload) => void,
): () => void {
  const unsubscribeLocal = subscribeToMarket(marketId, listener);

  if (!redisClients) {
    return unsubscribeLocal;
  }

  const clients = redisClients;
  const target = redisChannel(marketId);
  const onMessage = (incomingChannel: string, message: string): void => {
    if (incomingChannel !== target) return;
    try {
      listener(JSON.parse(message) as MarketEventPayload);
    } catch {
      // Ignore malformed cross-instance payloads.
    }
  };

  clients.subscriber.on("message", onMessage);
  void clients.subscriber.subscribe(target);

  return () => {
    unsubscribeLocal();
    clients.subscriber.off("message", onMessage);
    void clients.subscriber.unsubscribe(target);
  };
}
