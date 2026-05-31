import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------
export type ActivityEvent =
  | { type: 'trade'; marketId: string; outcomeId: string; side: string; sharesAmount: number; priceBps: number; timestamp: string }
  | { type: 'dispute'; marketId: string; proposedOutcomeId: string }
  | { type: 'resolved'; marketId: string; winningOutcomeId: string };

type SubscribeMsg = { type: 'subscribe_activity'; marketId: string };

// ---------------------------------------------------------------------------
// Rate limiter — token bucket, max 20 events/sec per market
// ---------------------------------------------------------------------------
const RATE_LIMIT = 20;
const WINDOW_MS = 1_000;

class MarketRateLimiter {
  private counts = new Map<string, { count: number; resetAt: number }>();

  allow(marketId: string): boolean {
    const now = Date.now();
    let entry = this.counts.get(marketId);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + WINDOW_MS };
      this.counts.set(marketId, entry);
    }
    if (entry.count >= RATE_LIMIT) return false;
    entry.count++;
    return true;
  }
}

// ---------------------------------------------------------------------------
// ActivityFeed
// ---------------------------------------------------------------------------
export class ActivityFeed {
  private wss: WebSocketServer;
  // marketId → set of subscribed sockets
  private subscriptions = new Map<string, Set<WebSocket>>();
  private rateLimiter = new MarketRateLimiter();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server });
    this.wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
      ws.on('message', (raw) => this.handleMessage(ws, raw.toString()));
      ws.on('close', () => this.removeSocket(ws));
    });
    logger.info('ActivityFeed WebSocket server attached');
  }

  private handleMessage(ws: WebSocket, raw: string): void {
    let msg: unknown;
    try { msg = JSON.parse(raw); } catch { return; }

    const { type, marketId } = msg as SubscribeMsg;
    if (type !== 'subscribe_activity' || typeof marketId !== 'string') return;

    if (!this.subscriptions.has(marketId)) {
      this.subscriptions.set(marketId, new Set());
    }
    this.subscriptions.get(marketId)!.add(ws);
  }

  private removeSocket(ws: WebSocket): void {
    for (const sockets of this.subscriptions.values()) {
      sockets.delete(ws);
    }
  }

  /** Publish an activity event to all subscribers of the market. */
  publish(event: ActivityEvent): void {
    const { marketId } = event as { marketId: string };
    if (!this.rateLimiter.allow(marketId)) return;

    const sockets = this.subscriptions.get(marketId);
    if (!sockets?.size) return;

    const payload = JSON.stringify(event);
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }

  close(): void {
    this.wss.close();
  }
}

// Singleton — initialised once in src/index.ts
let _feed: ActivityFeed | null = null;

export function initActivityFeed(server: Server): ActivityFeed {
  _feed = new ActivityFeed(server);
  return _feed;
}

export function getActivityFeed(): ActivityFeed {
  if (!_feed) throw new Error('ActivityFeed not initialised');
  return _feed;
}
