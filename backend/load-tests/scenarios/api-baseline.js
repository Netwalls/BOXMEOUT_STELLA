// =============================================================================
// API Baseline Performance Test
// =============================================================================
// Measures p50, p95, p99 latency for core API endpoints under normal load.
// Run: k6 run scenarios/api-baseline.js
// =============================================================================
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { CONFIG, HEADERS, THRESHOLDS } from '../config.js';

// Custom metrics
const healthLatency = new Trend('health_check_duration', true);
const marketsListLatency = new Trend('markets_list_duration', true);
const marketDetailLatency = new Trend('market_detail_duration', true);
const challengeLatency = new Trend('auth_challenge_duration', true);
const metricsLatency = new Trend('prometheus_metrics_duration', true);
const errorRate = new Rate('error_rate');
const requestCount = new Counter('total_requests');

export const options = {
  scenarios: {
    // Ramp up to 50 VUs, sustain, then ramp down
    baseline: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },   // Warm up
        { duration: '30s', target: 50 },   // Ramp to target
        { duration: '2m', target: 50 },    // Steady state
        { duration: '15s', target: 0 },    // Ramp down
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_duration: THRESHOLDS.http_req_duration,
    http_req_failed: THRESHOLDS.http_req_failed,
    health_check_duration: ['p(95)<100'],
    markets_list_duration: ['p(95)<500'],
    auth_challenge_duration: ['p(95)<300'],
    error_rate: ['rate<0.05'],
  },
};

export default function () {
  // 1. Health check
  {
    const res = http.get(`${CONFIG.BASE_URL}/health`, {
      tags: { name: 'health' },
    });
    healthLatency.add(res.timings.duration);
    const ok = check(res, {
      'health: status 200': (r) => r.status === 200,
      'health: body has status': (r) => {
        try { return JSON.parse(r.body).status === 'healthy'; } catch { return false; }
      },
    });
    errorRate.add(!ok);
    requestCount.add(1);
  }

  sleep(0.5);

  // 2. Detailed health check
  {
    const res = http.get(`${CONFIG.BASE_URL}/health/detailed`, {
      tags: { name: 'health_detailed' },
    });
    const ok = check(res, {
      'health/detailed: status 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
    requestCount.add(1);
  }

  sleep(0.5);

  // 3. List markets
  {
    const res = http.get(`${CONFIG.BASE_URL}/api/markets`, {
      headers: HEADERS,
      tags: { name: 'markets_list' },
    });
    marketsListLatency.add(res.timings.duration);
    const ok = check(res, {
      'markets list: status 200 or 404': (r) => r.status === 200 || r.status === 404,
    });
    errorRate.add(!ok);
    requestCount.add(1);
  }

  sleep(0.5);

  // 4. Get single market (may 404 in test env — that's ok)
  {
    const res = http.get(`${CONFIG.BASE_URL}/api/markets/${CONFIG.MARKET_ID}`, {
      headers: HEADERS,
      tags: { name: 'market_detail' },
    });
    marketDetailLatency.add(res.timings.duration);
    const ok = check(res, {
      'market detail: status 200 or 404': (r) => r.status === 200 || r.status === 404,
    });
    errorRate.add(!ok);
    requestCount.add(1);
  }

  sleep(0.5);

  // 5. Auth challenge request
  {
    const publicKey = `G${'A'.repeat(55)}`.substring(0, 56);
    const res = http.post(
      `${CONFIG.BASE_URL}/api/auth/challenge`,
      JSON.stringify({ publicKey }),
      { headers: HEADERS, tags: { name: 'auth_challenge' } }
    );
    challengeLatency.add(res.timings.duration);
    const ok = check(res, {
      'challenge: status 200 or 429': (r) => r.status === 200 || r.status === 429,
    });
    errorRate.add(!ok && res.status !== 429);
    requestCount.add(1);
  }

  sleep(0.5);

  // 6. Prometheus metrics endpoint
  {
    const res = http.get(`${CONFIG.BASE_URL}/metrics`, {
      tags: { name: 'prometheus_metrics' },
    });
    metricsLatency.add(res.timings.duration);
    const ok = check(res, {
      'metrics: status 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
    requestCount.add(1);
  }

  sleep(1);
}

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    scenario: 'api-baseline',
    metrics: {},
  };

  const metricNames = [
    'http_req_duration',
    'health_check_duration',
    'markets_list_duration',
    'market_detail_duration',
    'auth_challenge_duration',
    'prometheus_metrics_duration',
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

  if (data.metrics.error_rate) {
    summary.metrics.error_rate = data.metrics.error_rate.values.rate;
  }
  if (data.metrics.total_requests) {
    summary.metrics.total_requests = data.metrics.total_requests.values.count;
  }

  return {
    'results/api-baseline.json': JSON.stringify(summary, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

// Inline text summary (k6 doesn't export this by default in all envs)
function textSummary(data, opts) {
  // k6 will print its built-in summary; this is a fallback
  return '';
}
