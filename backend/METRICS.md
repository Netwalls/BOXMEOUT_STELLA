# Prometheus Metrics Implementation

This document describes the Prometheus metrics implementation for the BoxMeOut Stella backend API.

## Overview

The application exposes metrics at the `/metrics` endpoint in Prometheus format for monitoring and observability.

## Metrics Endpoint

**URL:** `http://localhost:3000/metrics`

**Format:** Prometheus text format

**Authentication:** None (should be restricted in production via firewall/network policies)

## Available Metrics

### HTTP Request Metrics

#### `http_request_duration_seconds`
- **Type:** Histogram
- **Description:** Duration of HTTP requests in seconds
- **Labels:** `method`, `route`, `status_code`
- **Buckets:** 0.01, 0.05, 0.1, 0.5, 1, 2, 5 seconds

#### `http_requests_total`
- **Type:** Counter
- **Description:** Total number of HTTP requests
- **Labels:** `method`, `route`, `status_code`

### Blockchain Metrics

#### `blockchain_call_duration_seconds`
- **Type:** Histogram
- **Description:** Duration of blockchain calls in seconds
- **Labels:** `operation`, `contract`, `status`
- **Buckets:** 0.1, 0.5, 1, 2, 5, 10, 30 seconds

#### `blockchain_calls_total`
- **Type:** Counter
- **Description:** Total number of blockchain calls
- **Labels:** `operation`, `contract`, `status`

#### `blockchain_call_errors_total`
- **Type:** Counter
- **Description:** Total number of blockchain call errors
- **Labels:** `operation`, `contract`, `error_type`

### WebSocket Metrics

#### `websocket_connections_active`
- **Type:** Gauge
- **Description:** Number of active WebSocket connections

#### `websocket_connections_total`
- **Type:** Counter
- **Description:** Total number of WebSocket connections
- **Labels:** `event` (connect/disconnect)

#### `websocket_messages_sent_total`
- **Type:** Counter
- **Description:** Total number of WebSocket messages sent
- **Labels:** `message_type`

### Prediction Metrics

#### `predictions_total`
- **Type:** Counter
- **Description:** Total number of predictions made
- **Labels:** `phase` (commit/reveal), `market_id`

#### `prediction_commit_duration_seconds`
- **Type:** Histogram
- **Description:** Duration of prediction commit operations
- **Buckets:** 0.1, 0.5, 1, 2, 5 seconds

#### `prediction_reveal_duration_seconds`
- **Type:** Histogram
- **Description:** Duration of prediction reveal operations
- **Buckets:** 0.1, 0.5, 1, 2, 5 seconds

### Trade Metrics

#### `trade_volume_usdc_total`
- **Type:** Counter
- **Description:** Total trade volume in USDC
- **Labels:** `market_id`, `trade_type`

#### `trades_total`
- **Type:** Counter
- **Description:** Total number of trades
- **Labels:** `market_id`, `trade_type`, `outcome`

#### `trade_duration_seconds`
- **Type:** Histogram
- **Description:** Duration of trade operations
- **Labels:** `trade_type`
- **Buckets:** 0.1, 0.5, 1, 2, 5, 10 seconds

### Error Metrics

#### `errors_total`
- **Type:** Counter
- **Description:** Total number of errors
- **Labels:** `error_type`, `route`, `status_code`

#### `validation_errors_total`
- **Type:** Counter
- **Description:** Total number of validation errors
- **Labels:** `field`, `error_type`

### Market Metrics

#### `markets_active`
- **Type:** Gauge
- **Description:** Number of active markets

#### `markets_created_total`
- **Type:** Counter
- **Description:** Total number of markets created
- **Labels:** `category`

#### `markets_resolved_total`
- **Type:** Counter
- **Description:** Total number of markets resolved
- **Labels:** `outcome`

### Database Metrics

#### `database_query_duration_seconds`
- **Type:** Histogram
- **Description:** Duration of database queries
- **Labels:** `operation`, `table`
- **Buckets:** 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1 seconds

#### `database_query_errors_total`
- **Type:** Counter
- **Description:** Total number of database query errors
- **Labels:** `operation`, `table`

### Cache Metrics

#### `cache_hits_total`
- **Type:** Counter
- **Description:** Total number of cache hits
- **Labels:** `cache_key`

#### `cache_misses_total`
- **Type:** Counter
- **Description:** Total number of cache misses
- **Labels:** `cache_key`

### Default Metrics

The following Node.js default metrics are also collected:
- `process_cpu_user_seconds_total`
- `process_cpu_system_seconds_total`
- `process_cpu_seconds_total`
- `process_start_time_seconds`
- `process_resident_memory_bytes`
- `nodejs_eventloop_lag_seconds`
- `nodejs_active_handles_total`
- `nodejs_active_requests_total`
- `nodejs_heap_size_total_bytes`
- `nodejs_heap_size_used_bytes`
- `nodejs_external_memory_bytes`
- `nodejs_heap_space_size_total_bytes`
- `nodejs_heap_space_size_used_bytes`
- `nodejs_heap_space_size_available_bytes`
- `nodejs_version_info`

## Usage in Code

### Automatic Tracking

HTTP requests are automatically tracked via the `metricsMiddleware`:

```typescript
import { metricsMiddleware } from './middleware/metrics.middleware.js';
app.use(metricsMiddleware);
```

### Manual Tracking

#### Track Blockchain Operations

```typescript
import { trackBlockchainOperation } from './utils/metricsTracker.js';

const result = await trackBlockchainOperation(
  'create_market',
  'factory',
  async () => {
    // Your blockchain call here
    return await factoryContract.createMarket(...);
  }
);
```

#### Track Predictions

```typescript
import { trackPredictionCommit, trackPredictionReveal } from './utils/metricsTracker.js';

// Commit phase
await trackPredictionCommit(marketId, async () => {
  return await commitPrediction(...);
});

// Reveal phase
await trackPredictionReveal(marketId, async () => {
  return await revealPrediction(...);
});
```

#### Track Trades

```typescript
import { trackTradeOperation } from './utils/metricsTracker.js';

await trackTradeOperation(marketId, 'buy', 'yes', 100.0, async () => {
  return await buyShares(...);
});
```

#### Track WebSocket Events

```typescript
import { trackWebSocketConnection, trackWebSocketMessage } from './utils/metricsTracker.js';

// On connection
trackWebSocketConnection('connect');

// On disconnect
trackWebSocketConnection('disconnect');

// On message sent
trackWebSocketMessage('market_update');
```

#### Track Database Queries

```typescript
import { trackDatabaseQuery } from './utils/metricsTracker.js';

const users = await trackDatabaseQuery('select', 'users', async () => {
  return await prisma.user.findMany();
});
```

#### Track Cache Operations

```typescript
import { trackCacheHit, trackCacheMiss } from './utils/metricsTracker.js';

const cached = await redis.get(key);
if (cached) {
  trackCacheHit('market_odds');
  return JSON.parse(cached);
} else {
  trackCacheMiss('market_odds');
  // Fetch from database
}
```

#### Track Market Operations

```typescript
import { 
  updateActiveMarkets, 
  trackMarketCreation, 
  trackMarketResolution 
} from './utils/metricsTracker.js';

// Update active markets count
updateActiveMarkets(42);

// Track market creation
trackMarketCreation('sports');

// Track market resolution
trackMarketResolution('yes');
```

## Prometheus Configuration

Add this job to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'boxmeout-backend'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
```

## Grafana Dashboards

### Useful Queries

**Request Rate:**
```promql
rate(http_requests_total[5m])
```

**Request Latency (p95):**
```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

**Error Rate:**
```promql
rate(errors_total[5m])
```

**Blockchain Call Latency:**
```promql
histogram_quantile(0.95, rate(blockchain_call_duration_seconds_bucket[5m]))
```

**Active WebSocket Connections:**
```promql
websocket_connections_active
```

**Predictions Per Minute:**
```promql
rate(predictions_total[1m]) * 60
```

**Trade Volume (USDC per minute):**
```promql
rate(trade_volume_usdc_total[1m]) * 60
```

**Cache Hit Rate:**
```promql
rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m]))
```

## Alerting Rules

Example Prometheus alerting rules:

```yaml
groups:
  - name: boxmeout_alerts
    rules:
      - alert: HighErrorRate
        expr: rate(errors_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          
      - alert: SlowBlockchainCalls
        expr: histogram_quantile(0.95, rate(blockchain_call_duration_seconds_bucket[5m])) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Blockchain calls are slow"
          
      - alert: HighWebSocketConnections
        expr: websocket_connections_active > 1000
        for: 5m
        labels:
          severity: info
        annotations:
          summary: "High number of WebSocket connections"
```

## Security Considerations

1. **Production Deployment:** Restrict `/metrics` endpoint access via firewall or reverse proxy
2. **Sensitive Data:** Ensure no PII or sensitive data is included in metric labels
3. **Cardinality:** Be cautious with high-cardinality labels (e.g., user IDs, transaction hashes)

## Testing

Test the metrics endpoint:

```bash
curl http://localhost:3000/metrics
```

Expected output:
```
# HELP http_request_duration_seconds Duration of HTTP requests in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.01",method="GET",route="/api/markets",status_code="200"} 45
...
```

## Performance Impact

- Metrics collection has minimal overhead (<1% CPU)
- Memory usage increases slightly with label cardinality
- Histogram buckets are pre-allocated for efficiency
- Default metrics collection interval: 10 seconds
