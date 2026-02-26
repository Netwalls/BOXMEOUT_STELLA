import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt.js';
import { logger } from '../utils/logger.js';
import { AuthError } from '../types/auth.types.js';

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

export interface SocketData {
  userId: string;
  publicKey: string;
  connectedAt: number;
  lastHeartbeat: number;
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

// Rate limiting per connection
const CONNECTION_RATE_LIMITS = {
  SUBSCRIBE_PER_MINUTE: 30,
  UNSUBSCRIBE_PER_MINUTE: 30,
};

interface RateLimitTracker {
  subscribeCount: number;
  unsubscribeCount: number;
  windowStart: number;
}

/**
 * Initialize Socket.io server with authentication and room management
 */
export function initializeSocketIO(
  httpServer: HttpServer,
  corsOrigin: string | string[]
): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Rate limit tracking per socket
  const rateLimits = new Map<string, RateLimitTracker>();

  // JWT authentication middleware
  io.use(async (socket: Socket, next: (err?: Error) => void) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        throw new AuthError('NO_TOKEN', 'Authentication token required', 401);
      }

      const payload = verifyAccessToken(token);

      // Attach user data to socket
      socket.data = {
        userId: payload.userId,
        publicKey: payload.publicKey,
        connectedAt: Date.now(),
        lastHeartbeat: Date.now(),
      } as SocketData;

      logger.info('WebSocket authenticated', {
        socketId: socket.id,
        userId: payload.userId,
      });

      next();
    } catch (error) {
      logger.warn('WebSocket authentication failed', {
        socketId: socket.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(new Error('Authentication failed'));
    }
  });

  // Connection handler
  io.on('connection', (socket: Socket) => {
    const socketData = socket.data as SocketData;

    logger.info('WebSocket connected', {
      socketId: socket.id,
      userId: socketData.userId,
    });

    // Join user's personal room for notifications
    const userRoom = `user:${socketData.userId}`;
    socket.join(userRoom);
    logger.debug('Socket joined user room', {
      socketId: socket.id,
      userId: socketData.userId,
      room: userRoom,
    });

    // Initialize rate limit tracker
    rateLimits.set(socket.id, {
      subscribeCount: 0,
      unsubscribeCount: 0,
      windowStart: Date.now(),
    });

    // Join user's private room for personal notifications (Issue #116)
    socket.join(`user:${socketData.userId}`);

    // Heartbeat handler
    socket.on('heartbeat', () => {
      socketData.lastHeartbeat = Date.now();
      socket.emit('heartbeat_ack', { timestamp: Date.now() });
    });

    // Subscribe to market updates
    socket.on('subscribe_market', (marketId: string) => {
      if (!isValidMarketId(marketId)) {
        socket.emit('error', { message: 'Invalid market ID' });
        return;
      }

      if (!checkRateLimit(socket.id, 'subscribe', rateLimits)) {
        socket.emit('error', { message: 'Rate limit exceeded' });
        return;
      }

      const room = `market:${marketId}`;
      socket.join(room);

      logger.debug('Socket subscribed to market', {
        socketId: socket.id,
        userId: socketData.userId,
        marketId,
      });

      socket.emit('subscribed', { marketId });
    });

    // Unsubscribe from market updates
    socket.on('unsubscribe_market', (marketId: string) => {
      if (!isValidMarketId(marketId)) {
        socket.emit('error', { message: 'Invalid market ID' });
        return;
      }

      if (!checkRateLimit(socket.id, 'unsubscribe', rateLimits)) {
        socket.emit('error', { message: 'Rate limit exceeded' });
        return;
      }

      const room = `market:${marketId}`;
      socket.leave(room);

      logger.debug('Socket unsubscribed from market', {
        socketId: socket.id,
        userId: socketData.userId,
        marketId,
      });

      socket.emit('unsubscribed', { marketId });
    });

    // Subscribe to global leaderboard updates (Issue #116)
    socket.on('subscribe_leaderboard', () => {
      if (!checkRateLimit(socket.id, 'subscribe', rateLimits)) {
        socket.emit('error', { message: 'Rate limit exceeded' });
        return;
      }

      socket.join('leaderboard:global');

      logger.debug('Socket subscribed to leaderboard', {
        socketId: socket.id,
        userId: socketData.userId,
      });

      socket.emit('subscribed_leaderboard', { timestamp: Date.now() });
    });

    // Unsubscribe from leaderboard updates (Issue #116)
    socket.on('unsubscribe_leaderboard', () => {
      if (!checkRateLimit(socket.id, 'unsubscribe', rateLimits)) {
        socket.emit('error', { message: 'Rate limit exceeded' });
        return;
      }

      socket.leave('leaderboard:global');

      logger.debug('Socket unsubscribed from leaderboard', {
        socketId: socket.id,
        userId: socketData.userId,
      });

      socket.emit('unsubscribed_leaderboard', { timestamp: Date.now() });
    });

    // Disconnect handler
    socket.on('disconnect', (reason: string) => {
      logger.info('WebSocket disconnected', {
        socketId: socket.id,
        userId: socketData.userId,
        reason,
      });

      // Cleanup rate limit tracker
      rateLimits.delete(socket.id);
    });
  });

  // Heartbeat cleanup interval (remove stale connections)
  setInterval(() => {
    const now = Date.now();
    const staleThreshold = 90000; // 90 seconds

    io.sockets.sockets.forEach((socket: Socket) => {
      const socketData = socket.data as SocketData;
      if (now - socketData.lastHeartbeat > staleThreshold) {
        logger.warn('Disconnecting stale socket', {
          socketId: socket.id,
          userId: socketData.userId,
          lastHeartbeat: socketData.lastHeartbeat,
        });
        socket.disconnect(true);
      }
    });
  }, 30000); // Check every 30 seconds

  return io;
}

/**
 * Validate market ID format
 */
function isValidMarketId(marketId: unknown): marketId is string {
  return (
    typeof marketId === 'string' &&
    marketId.length > 0 &&
    marketId.length <= 100
  );
}

/**
 * Check rate limit for socket operations
 */
function checkRateLimit(
  socketId: string,
  operation: 'subscribe' | 'unsubscribe',
  rateLimits: Map<string, RateLimitTracker>
): boolean {
  const tracker = rateLimits.get(socketId);
  if (!tracker) return false;

  const now = Date.now();
  const windowDuration = 60000; // 1 minute

  // Reset window if expired
  if (now - tracker.windowStart > windowDuration) {
    tracker.subscribeCount = 0;
    tracker.unsubscribeCount = 0;
    tracker.windowStart = now;
  }

  // Check limit
  if (operation === 'subscribe') {
    if (tracker.subscribeCount >= CONNECTION_RATE_LIMITS.SUBSCRIBE_PER_MINUTE) {
      return false;
    }
    tracker.subscribeCount++;
  } else {
    if (
      tracker.unsubscribeCount >= CONNECTION_RATE_LIMITS.UNSUBSCRIBE_PER_MINUTE
    ) {
      return false;
    }
    tracker.unsubscribeCount++;
  }

  return true;
}
