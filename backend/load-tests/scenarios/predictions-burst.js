// =============================================================================
// Predictions Burst Test — 100 Simultaneous Predictions on One Market
// =============================================================================
// Simulates 100 users submitting predictions on a single market concurrently.
// Tests database write contention, blockchain queuing, and commit-reveal flow.
//
// Run: k6 run scenarios/predictions-burst.js
// Env: BASE_URL, MARKET_ID, AUTH_TOKENS (comma-separated pre-generated tokens)
// =============================================================================
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { CONFIG, HEADERS, generatePublicKey } from '../config.js';

// Custom metrics
const commitLatency = new Trend('prediction_commit_duration', true);
const revealLatency = new Trend('prediction_reveal_duration', true);
const buySharesLatency = new Trend('buy_shares_duration', true);
const sellSharesLatency = new Trend('sell_shares_duration', true);
const predictionErrors = new Rate('prediction_error_rate');
const commitsSucceeded = new Counter('commits_succeeded');
const commitsFailed = new Counter('commits_failed');
const revealsSucceeded = new Counter('reveals_succeeded');
const revealsFailed = new Counter('reveals_failed');
const sharesTraded = new Counter('shares_traded');

// Pre-generated auth tokens for load testing
// In production testing, generate these via a setup script
const authTokens = __ENV.AUTH_TOKENS
  ? __ENV.AUTH_TOKENS.split(',')
  : [];

export const options = {
  scenarios: {
    // Burst: All 100 VUs start at once
    prediction_burst: {
      executor: 'shared-iterations',
      vus: 100,
      iterations: 100,
      maxDuration: '2m',
    },
    // Sustained: Continuous prediction load
    prediction_sustained: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 20 },
        { duration: '30s', target: 50 },
        { duration: '1m', target: 100 },
        { duration: '2m', target: 100 },
        { duration: '15s', target: 0 },
      ],
      startTime: '2m30s', // Start after burst completes
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    prediction_commit_duration: [
      'p(50)<500',
      'p(95)<2000',
      'p(99)<5000',
    ],
    prediction_reveal_duration: [
      'p(50)<500',
      'p(95)<2000',
      'p(99)<5000',
    ],
    buy_shares_duration: [
      'p(50)<300',
      'p(95)<1000',
      'p(99)<3000',
    ],
    prediction_error_rate: ['rate<0.15'], // Allow higher error rate due to blockchain
  },
};

function getAuthHeaders(vuId) {
  if (authTokens.length > 0) {
    const token = authTokens[vuId % authTokens.length];
    return { ...HEADERS, Authorization: `Bearer ${token}` };
  }
  // Fallback: attempt without auth (will get 401, measured as errors)
  return HEADERS;
}

export default function () {
  const vuId = __VU;
  const iterationId = __ITER;
  const marketId = CONFIG.MARKET_ID;
  const headers = getAuthHeaders(vuId);

  group('commit-reveal prediction flow', function () {
    // Step 1: Commit a prediction
    let commitmentId = null;

    {
      const outcome = Math.random() > 0.5 ? 'YES' : 'NO';
      const amount = Math.floor(Math.random() * 100) + 10; // 10-110 USDC

      const payload = JSON.stringify({
        outcome,
        amountUsdc: amount,
      });

      const res = http.post(
        `${CONFIG.BASE_URL}/api/markets/${marketId}/predict`,
        payload,
        { headers, tags: { name: 'prediction_commit' }, timeout: '30s' }
      );

      commitLatency.add(res.timings.duration);

      const ok = check(res, {
        'commit: status 200 or 201': (r) => r.status === 200 || r.status === 201,
        'commit: has commitment ID': (r) => {
          try {
            const body = JSON.parse(r.body);
            const data = body.data || body;
            commitmentId = data.commitmentId || data.predictionId || data.id;
            return !!commitmentId;
          } catch {
            return false;
          }
        },
      });

      if (ok) {
        commitsSucceeded.add(1);
      } else {
        commitsFailed.add(1);
        predictionErrors.add(true);
      }
    }

    sleep(1);

    // Step 2: Reveal the prediction
    if (commitmentId) {
      const res = http.post(
        `${CONFIG.BASE_URL}/api/predictions/${commitmentId}/reveal`,
        JSON.stringify({}),
        { headers, tags: { name: 'prediction_reveal' }, timeout: '30s' }
      );

      revealLatency.add(res.timings.duration);

      const ok = check(res, {
        'reveal: status 200': (r) => r.status === 200,
      });

      if (ok) {
        revealsSucceeded.add(1);
      } else {
        revealsFailed.add(1);
        predictionErrors.add(true);
      }
    }

    sleep(0.5);
  });

  group('share trading', function () {
    // Step 3: Buy shares
    {
      const outcome = Math.random() > 0.5 ? 'YES' : 'NO';
      const shares = Math.floor(Math.random() * 50) + 1;

      const res = http.post(
        `${CONFIG.BASE_URL}/api/markets/${marketId}/buy-shares`,
        JSON.stringify({ outcome, shares }),
        { headers, tags: { name: 'buy_shares' }, timeout: '15s' }
      );

      buySharesLatency.add(res.timings.duration);

      const ok = check(res, {
        'buy shares: status 200 or 201': (r) => r.status === 200 || r.status === 201,
      });

      if (ok) {
        sharesTraded.add(1);
      } else {
        predictionErrors.add(true);
      }
    }

    sleep(0.5);

    // Step 4: Sell shares
    {
      const outcome = Math.random() > 0.5 ? 'YES' : 'NO';
      const shares = Math.floor(Math.random() * 10) + 1;

      const res = http.post(
        `${CONFIG.BASE_URL}/api/markets/${marketId}/sell-shares`,
        JSON.stringify({ outcome, shares }),
        { headers, tags: { name: 'sell_shares' }, timeout: '15s' }
      );

      sellSharesLatency.add(res.timings.duration);

      const ok = check(res, {
        'sell shares: status 200 or 201': (r) => r.status === 200 || r.status === 201,
      });

      if (ok) {
        sharesTraded.add(1);
      }
    }
  });

  sleep(1);
}

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    scenario: 'predictions-burst',
    metrics: {},
  };

  const metricNames = [
    'prediction_commit_duration',
    'prediction_reveal_duration',
    'buy_shares_duration',
    'sell_shares_duration',
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

  if (data.metrics.commits_succeeded) {
    summary.metrics.commits_succeeded = data.metrics.commits_succeeded.values.count;
  }
  if (data.metrics.commits_failed) {
    summary.metrics.commits_failed = data.metrics.commits_failed.values.count;
  }
  if (data.metrics.reveals_succeeded) {
    summary.metrics.reveals_succeeded = data.metrics.reveals_succeeded.values.count;
  }
  if (data.metrics.reveals_failed) {
    summary.metrics.reveals_failed = data.metrics.reveals_failed.values.count;
  }
  if (data.metrics.shares_traded) {
    summary.metrics.shares_traded = data.metrics.shares_traded.values.count;
  }
  if (data.metrics.prediction_error_rate) {
    summary.metrics.error_rate = data.metrics.prediction_error_rate.values.rate;
  }

  return {
    'results/predictions-burst.json': JSON.stringify(summary, null, 2),
  };
}
