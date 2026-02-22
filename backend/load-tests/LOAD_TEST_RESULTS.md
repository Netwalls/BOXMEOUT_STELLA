# BoxMeOut Stella — Load Test Results & Baseline Metrics

## Overview

This document tracks performance baselines for the BoxMeOut Stella prediction market platform. Run load tests regularly against staging and before production deploys.

## Prerequisites

```bash
# Install k6
brew install k6          # macOS
sudo apt install k6      # Ubuntu/Debian

# Start the backend server
cd backend && npm run dev
```

## Running Tests

```bash
cd backend/load-tests

# Run all scenarios
./run-all.sh

# Run a specific scenario
./run-all.sh --scenario baseline
./run-all.sh --scenario websocket
./run-all.sh --scenario predictions
./run-all.sh --scenario amm

# Override target
./run-all.sh --base-url http://staging.boxmeout.io:3000

# Run individual k6 scripts directly
k6 run scenarios/api-baseline.js
k6 run -e MARKET_ID=abc123 scenarios/predictions-burst.js
```

## Test Scenarios

### 1. API Baseline (`scenarios/api-baseline.js`)

Measures core API latency under moderate load (50 concurrent users).

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Basic health check |
| `/health/detailed` | GET | Service-level health |
| `/api/markets` | GET | List all markets |
| `/api/markets/:id` | GET | Single market detail |
| `/api/auth/challenge` | POST | Auth nonce request |
| `/metrics` | GET | Prometheus metrics |

**Thresholds:**
- `p(50)` < 200ms
- `p(95)` < 500ms
- `p(99)` < 1000ms
- Error rate < 5%

### 2. WebSocket Connections (`scenarios/websocket-connections.js`)

Ramps to 1000 concurrent WebSocket connections and sustains for 2 minutes.

| Phase | Duration | Target Connections |
|-------|----------|--------------------|
| Ramp 1 | 30s | 100 |
| Ramp 2 | 30s | 500 |
| Ramp 3 | 30s | 1000 |
| Sustain | 2m | 1000 |
| Ramp down | 30s | 0 |

**Thresholds:**
- Connection time `p(95)` < 2000ms
- Message latency `p(95)` < 500ms
- Error rate < 10%

### 3. Predictions Burst (`scenarios/predictions-burst.js`)

100 users simultaneously submit predictions on a single market, then sustained load.

| Phase | VUs | Duration | Description |
|-------|-----|----------|-------------|
| Burst | 100 | instant | All 100 commit at once |
| Sustained | 20→100 | 3m45s | Continuous prediction flow |

**Tested Operations:**
- `POST /api/markets/:id/predict` — Commit prediction
- `POST /api/predictions/:id/reveal` — Reveal prediction
- `POST /api/markets/:id/buy-shares` — Buy YES/NO shares
- `POST /api/markets/:id/sell-shares` — Sell shares

**Thresholds:**
- Commit `p(50)` < 500ms, `p(95)` < 2000ms
- Reveal `p(50)` < 500ms, `p(95)` < 2000ms
- Buy shares `p(50)` < 300ms, `p(95)` < 1000ms
- Error rate < 15% (blockchain operations may timeout)

### 4. AMM High-Frequency Trading (`scenarios/amm-high-frequency.js`)

Simulates high-frequency trading against the AMM with up to 200 trades/second.

| Phase | Duration | Rate | Description |
|-------|----------|------|-------------|
| Warmup | 30s | 5 VUs | Establish baseline prices |
| Ramp | 30s | 10 tx/s | Light trading |
| Ramp | 30s | 50 tx/s | Medium frequency |
| Stress | 1m | 100 tx/s | High frequency |
| Peak | 1m | 200 tx/s | Maximum stress |
| Cooldown | 45s | 50→0 tx/s | Wind down |

**Trade Distribution:**
- 40% Buy shares
- 30% Sell shares
- 20% Read pool state
- 10% Add liquidity

**Concurrent readers:** 20 VUs continuously reading pool state during trading.

**Thresholds:**
- Buy/Sell `p(50)` < 300ms, `p(95)` < 1500ms
- Pool state read `p(50)` < 100ms, `p(95)` < 300ms
- Trade error rate < 20%

---

## Baseline Metrics Template

Fill in after first test run:

### Environment
- **Date:** YYYY-MM-DD
- **Server:** (e.g., MacBook M2, EC2 t3.medium)
- **Node.js:** (version)
- **PostgreSQL:** (version)
- **Redis:** (version)
- **Network:** (local / staging / production)

### API Baseline Results

| Endpoint | p50 | p95 | p99 | Max | Error Rate |
|----------|-----|-----|-----|-----|------------|
| `GET /health` | —ms | —ms | —ms | —ms | —% |
| `GET /api/markets` | —ms | —ms | —ms | —ms | —% |
| `GET /api/markets/:id` | —ms | —ms | —ms | —ms | —% |
| `POST /api/auth/challenge` | —ms | —ms | —ms | —ms | —% |
| `GET /metrics` | —ms | —ms | —ms | —ms | —% |

### WebSocket Results

| Metric | Value |
|--------|-------|
| Peak concurrent connections | — |
| Connection time (p95) | —ms |
| Message latency (p95) | —ms |
| Connection error rate | —% |
| Messages received | — |

### Predictions Burst Results

| Operation | p50 | p95 | p99 | Success Rate |
|-----------|-----|-----|-----|--------------|
| Commit prediction | —ms | —ms | —ms | —% |
| Reveal prediction | —ms | —ms | —ms | —% |
| Buy shares | —ms | —ms | —ms | —% |
| Sell shares | —ms | —ms | —ms | —% |

### AMM High-Frequency Results

| Metric | Value |
|--------|-------|
| Total trades executed | — |
| Peak throughput (tx/sec) | — |
| Buy latency (p95) | —ms |
| Sell latency (p95) | —ms |
| Pool state read (p95) | —ms |
| Max slippage observed | —% |
| Trade error rate | —% |

---

## Interpreting Results

### Green (Pass)
- All percentile thresholds met
- Error rates within bounds
- No connection drops during sustained phase

### Yellow (Warning)
- p99 exceeding thresholds but p95 passing
- Error rate 5-15%
- Sporadic WebSocket disconnects

### Red (Fail)
- p95 thresholds breached
- Error rate > 15%
- WebSocket connections unable to sustain target
- AMM pool state inconsistency detected

## Common Bottlenecks

1. **Database connection pool exhaustion** — Increase Prisma pool size
2. **Redis connection limits** — Scale Redis or use connection pooling
3. **Blockchain RPC rate limiting** — Queue transactions, use batch calls
4. **Node.js event loop blocking** — Profile with `--prof`, move crypto to worker threads
5. **WebSocket memory** — Each connection ~50KB; 1000 connections = ~50MB baseline
