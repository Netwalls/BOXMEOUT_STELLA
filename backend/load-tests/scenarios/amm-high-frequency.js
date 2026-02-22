// =============================================================================
// AMM High-Frequency Trading Load Test
// =============================================================================
// Simulates high-frequency trading against the Automated Market Maker.
// Tests pool state consistency, price slippage under load, and throughput.
//
// Run: k6 run scenarios/amm-high-frequency.js
// Env: BASE_URL, MARKET_ID, AUTH_TOKENS
// =============================================================================
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter, Gauge } from 'k6/metrics';
import { CONFIG, HEADERS } from '../config.js';

// Custom metrics
const buyLatency = new Trend('amm_buy_duration', true);
const sellLatency = new Trend('amm_sell_duration', true);
const poolStateLatency = new Trend('amm_pool_state_duration', true);
const createPoolLatency = new Trend('amm_create_pool_duration', true);
const addLiquidityLatency = new Trend('amm_add_liquidity_duration', true);
const tradeErrors = new Rate('amm_trade_error_rate');
const tradesExecuted = new Counter('amm_trades_executed');
const totalVolume = new Counter('amm_total_volume');
const slippageGauge = new Gauge('amm_max_slippage');

// Pre-generated auth tokens
const authTokens = __ENV.AUTH_TOKENS
  ? __ENV.AUTH_TOKENS.split(',')
  : [];

export const options = {
  scenarios: {
    // Phase 1: Warm-up — light trading to establish baseline prices
    warmup: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
      gracefulStop: '5s',
    },
    // Phase 2: Ramp — increasing trade frequency
    ramp_trading: {
      executor: 'ramping-arrival-rate',
      startRate: 10,        // 10 trades/sec
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 200,
      stages: [
        { duration: '30s', target: 10 },   // 10 trades/sec
        { duration: '30s', target: 50 },   // 50 trades/sec
        { duration: '1m', target: 100 },   // 100 trades/sec
        { duration: '1m', target: 200 },   // 200 trades/sec (stress)
        { duration: '30s', target: 50 },   // Cool down
        { duration: '15s', target: 0 },    // Wind down
      ],
      startTime: '35s', // Start after warmup
    },
    // Phase 3: Pool state reads — concurrent reads during heavy trading
    pool_state_readers: {
      executor: 'constant-vus',
      vus: 20,
      duration: '3m',
      startTime: '35s',
      gracefulStop: '10s',
    },
  },
  thresholds: {
    amm_buy_duration: [
      'p(50)<300',
      'p(95)<1500',
      'p(99)<5000',
    ],
    amm_sell_duration: [
      'p(50)<300',
      'p(95)<1500',
      'p(99)<5000',
    ],
    amm_pool_state_duration: [
      'p(50)<100',
      'p(95)<300',
      'p(99)<1000',
    ],
    amm_trade_error_rate: ['rate<0.20'], // Allow 20% for blockchain contention
  },
};

function getAuthHeaders(vuId) {
  if (authTokens.length > 0) {
    const token = authTokens[vuId % authTokens.length];
    return { ...HEADERS, Authorization: `Bearer ${token}` };
  }
  return HEADERS;
}

export default function () {
  const vuId = __VU;
  const scenario = __ENV.scenario || exec.scenario.name;
  const marketId = CONFIG.MARKET_ID;
  const headers = getAuthHeaders(vuId);

  // Pool state readers scenario — only read pool state
  if (__ENV.__ITER !== undefined && vuId > 180) {
    readPoolState(marketId, headers);
    sleep(0.5);
    return;
  }

  // Trading scenarios — execute trades
  group('amm_trading', function () {
    // Randomly choose: buy YES, buy NO, sell YES, sell NO
    const action = Math.random();
    const outcome = Math.random() > 0.5 ? 'YES' : 'NO';

    if (action < 0.4) {
      // 40% chance: Buy shares
      buyShares(marketId, outcome, headers);
    } else if (action < 0.7) {
      // 30% chance: Sell shares
      sellShares(marketId, outcome, headers);
    } else if (action < 0.9) {
      // 20% chance: Read pool state
      readPoolState(marketId, headers);
    } else {
      // 10% chance: Add liquidity
      addLiquidity(marketId, headers);
    }
  });

  // High frequency: minimal sleep between trades
  sleep(Math.random() * 0.5); // 0-500ms between trades
}

function buyShares(marketId, outcome, headers) {
  const shares = Math.floor(Math.random() * 100) + 1;  // 1-100 shares
  const maxPrice = outcome === 'YES' ? 0.95 : 0.95;     // Slippage protection

  const payload = JSON.stringify({
    outcome,
    shares,
    maxPrice,
  });

  const res = http.post(
    `${CONFIG.BASE_URL}/api/markets/${marketId}/buy-shares`,
    payload,
    { headers, tags: { name: 'amm_buy' }, timeout: '30s' }
  );

  buyLatency.add(res.timings.duration);

  const ok = check(res, {
    'amm buy: status 200/201': (r) => r.status === 200 || r.status === 201,
    'amm buy: has trade data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return !!(body.data || body.trade || body.txHash);
      } catch {
        return false;
      }
    },
  });

  if (ok) {
    tradesExecuted.add(1);
    totalVolume.add(shares);

    // Check for slippage
    try {
      const body = JSON.parse(res.body);
      const data = body.data || body;
      if (data.slippage) {
        slippageGauge.add(data.slippage);
      }
    } catch { /* ignore */ }
  } else {
    tradeErrors.add(true);
  }
}

function sellShares(marketId, outcome, headers) {
  const shares = Math.floor(Math.random() * 50) + 1;  // 1-50 shares
  const minPrice = 0.05;  // Slippage protection

  const payload = JSON.stringify({
    outcome,
    shares,
    minPrice,
  });

  const res = http.post(
    `${CONFIG.BASE_URL}/api/markets/${marketId}/sell-shares`,
    payload,
    { headers, tags: { name: 'amm_sell' }, timeout: '30s' }
  );

  sellLatency.add(res.timings.duration);

  const ok = check(res, {
    'amm sell: status 200/201': (r) => r.status === 200 || r.status === 201,
  });

  if (ok) {
    tradesExecuted.add(1);
    totalVolume.add(shares);
  } else {
    tradeErrors.add(true);
  }
}

function readPoolState(marketId, headers) {
  const res = http.get(
    `${CONFIG.BASE_URL}/api/markets/${marketId}`,
    { headers, tags: { name: 'amm_pool_state' } }
  );

  poolStateLatency.add(res.timings.duration);

  check(res, {
    'pool state: status 200/404': (r) => r.status === 200 || r.status === 404,
    'pool state: has reserves': (r) => {
      try {
        const body = JSON.parse(r.body);
        const data = body.data || body;
        return !!(data.reserves || data.odds || data.liquidity);
      } catch {
        return false;
      }
    },
  });
}

function addLiquidity(marketId, headers) {
  const amount = Math.floor(Math.random() * 1000) + 100; // 100-1100 USDC

  const payload = JSON.stringify({
    amountUsdc: amount,
  });

  const res = http.post(
    `${CONFIG.BASE_URL}/api/markets/${marketId}/add-liquidity`,
    payload,
    { headers, tags: { name: 'amm_add_liquidity' }, timeout: '30s' }
  );

  addLiquidityLatency.add(res.timings.duration);

  const ok = check(res, {
    'add liquidity: status 200/201': (r) => r.status === 200 || r.status === 201,
  });

  if (ok) {
    totalVolume.add(amount);
  } else {
    tradeErrors.add(true);
  }
}

// Need to import exec for scenario name detection
import exec from 'k6/execution';

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    scenario: 'amm-high-frequency',
    metrics: {},
  };

  const metricNames = [
    'amm_buy_duration',
    'amm_sell_duration',
    'amm_pool_state_duration',
    'amm_add_liquidity_duration',
    'http_req_duration',
  ];

  for (const name of metricNames) {
    if (data.metrics[name]) {
      const m = data.metrics[name].values;
      summary.metrics[name] = {
        min: Math.round(m.min * 100) / 100,
        avg: Math.round(m.avg * 100) / 100,
        med: Math.round(m.med * 100) / 100,
        p90: Math.round(m['p(90)'] * 100) / 100,
        p95: Math.round(m['p(95)'] * 100) / 100,
        p99: Math.round(m['p(99)'] * 100) / 100,
        max: Math.round(m.max * 100) / 100,
      };
    }
  }

  if (data.metrics.amm_trades_executed) {
    summary.metrics.trades_executed = data.metrics.amm_trades_executed.values.count;
  }
  if (data.metrics.amm_total_volume) {
    summary.metrics.total_volume = data.metrics.amm_total_volume.values.count;
  }
  if (data.metrics.amm_trade_error_rate) {
    summary.metrics.error_rate = data.metrics.amm_trade_error_rate.values.rate;
  }
  if (data.metrics.amm_max_slippage) {
    summary.metrics.max_slippage = data.metrics.amm_max_slippage.values.max;
  }

  return {
    'results/amm-high-frequency.json': JSON.stringify(summary, null, 2),
  };
}
