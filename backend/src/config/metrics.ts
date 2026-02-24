// backend/src/config/metrics.ts - Prometheus Metrics Configuration
import client from 'prom-client';

// Create a Registry
export const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// =============================================================================
// HTTP REQUEST METRICS
// =============================================================================

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// =============================================================================
// BLOCKCHAIN METRICS
// =============================================================================

export const blockchainCallDuration = new client.Histogram({
  name: 'blockchain_call_duration_seconds',
  help: 'Duration of blockchain calls in seconds',
  labelNames: ['operation', 'contract', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

export const blockchainCallTotal = new client.Counter({
  name: 'blockchain_calls_total',
  help: 'Total number of blockchain calls',
  labelNames: ['operation', 'contract', 'status'],
  registers: [register],
});

export const blockchainCallErrors = new client.Counter({
  name: 'blockchain_call_errors_total',
  help: 'Total number of blockchain call errors',
  labelNames: ['operation', 'contract', 'error_type'],
  registers: [register],
});

// =============================================================================
// WEBSOCKET METRICS
// =============================================================================

export const activeWebSocketConnections = new client.Gauge({
  name: 'websocket_connections_active',
  help: 'Number of active WebSocket connections',
  registers: [register],
});

export const websocketConnectionsTotal = new client.Counter({
  name: 'websocket_connections_total',
  help: 'Total number of WebSocket connections',
  labelNames: ['event'],
  registers: [register],
});

export const websocketMessagesSent = new client.Counter({
  name: 'websocket_messages_sent_total',
  help: 'Total number of WebSocket messages sent',
  labelNames: ['message_type'],
  registers: [register],
});

// =============================================================================
// PREDICTION METRICS
// =============================================================================

export const predictionsPerMinute = new client.Counter({
  name: 'predictions_total',
  help: 'Total number of predictions made',
  labelNames: ['phase', 'market_id'],
  registers: [register],
});

export const predictionCommitDuration = new client.Histogram({
  name: 'prediction_commit_duration_seconds',
  help: 'Duration of prediction commit operations',
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const predictionRevealDuration = new client.Histogram({
  name: 'prediction_reveal_duration_seconds',
  help: 'Duration of prediction reveal operations',
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register],
});

// =============================================================================
// TRADE METRICS
// =============================================================================

export const tradeVolume = new client.Counter({
  name: 'trade_volume_usdc_total',
  help: 'Total trade volume in USDC',
  labelNames: ['market_id', 'trade_type'],
  registers: [register],
});

export const tradesTotal = new client.Counter({
  name: 'trades_total',
  help: 'Total number of trades',
  labelNames: ['market_id', 'trade_type', 'outcome'],
  registers: [register],
});

export const tradeDuration = new client.Histogram({
  name: 'trade_duration_seconds',
  help: 'Duration of trade operations',
  labelNames: ['trade_type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// =============================================================================
// ERROR METRICS
// =============================================================================

export const errorRate = new client.Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['error_type', 'route', 'status_code'],
  registers: [register],
});

export const validationErrors = new client.Counter({
  name: 'validation_errors_total',
  help: 'Total number of validation errors',
  labelNames: ['field', 'error_type'],
  registers: [register],
});

// =============================================================================
// MARKET METRICS
// =============================================================================

export const activeMarkets = new client.Gauge({
  name: 'markets_active',
  help: 'Number of active markets',
  registers: [register],
});

export const marketCreations = new client.Counter({
  name: 'markets_created_total',
  help: 'Total number of markets created',
  labelNames: ['category'],
  registers: [register],
});

export const marketResolutions = new client.Counter({
  name: 'markets_resolved_total',
  help: 'Total number of markets resolved',
  labelNames: ['outcome'],
  registers: [register],
});

// =============================================================================
// DATABASE METRICS
// =============================================================================

export const databaseQueryDuration = new client.Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

export const databaseQueryErrors = new client.Counter({
  name: 'database_query_errors_total',
  help: 'Total number of database query errors',
  labelNames: ['operation', 'table'],
  registers: [register],
});

// =============================================================================
// CACHE METRICS
// =============================================================================

export const cacheHits = new client.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_key'],
  registers: [register],
});

export const cacheMisses = new client.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_key'],
  registers: [register],
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Track HTTP request metrics
 */
export function trackHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  duration: number
): void {
  httpRequestDuration
    .labels(method, route, statusCode.toString())
    .observe(duration);
  httpRequestTotal.labels(method, route, statusCode.toString()).inc();
}

/**
 * Track blockchain call metrics
 */
export function trackBlockchainCall(
  operation: string,
  contract: string,
  status: 'success' | 'error',
  duration: number
): void {
  blockchainCallDuration.labels(operation, contract, status).observe(duration);
  blockchainCallTotal.labels(operation, contract, status).inc();
}

/**
 * Track blockchain error
 */
export function trackBlockchainError(
  operation: string,
  contract: string,
  errorType: string
): void {
  blockchainCallErrors.labels(operation, contract, errorType).inc();
}

/**
 * Track prediction
 */
export function trackPrediction(
  phase: 'commit' | 'reveal',
  marketId: string
): void {
  predictionsPerMinute.labels(phase, marketId).inc();
}

/**
 * Track trade
 */
export function trackTrade(
  marketId: string,
  tradeType: 'buy' | 'sell',
  outcome: string,
  volumeUsdc: number
): void {
  tradesTotal.labels(marketId, tradeType, outcome).inc();
  tradeVolume.labels(marketId, tradeType).inc(volumeUsdc);
}

/**
 * Track error
 */
export function trackError(
  errorType: string,
  route: string,
  statusCode: number
): void {
  errorRate.labels(errorType, route, statusCode.toString()).inc();
}

/**
 * Track WebSocket connection
 */
export function trackWebSocketConnection(
  event: 'connect' | 'disconnect'
): void {
  websocketConnectionsTotal.labels(event).inc();
  if (event === 'connect') {
    activeWebSocketConnections.inc();
  } else {
    activeWebSocketConnections.dec();
  }
}

/**
 * Track WebSocket message
 */
export function trackWebSocketMessage(messageType: string): void {
  websocketMessagesSent.labels(messageType).inc();
}
