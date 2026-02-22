// Load test shared configuration for BoxMeOut Stella
// Usage: import { CONFIG, THRESHOLDS } from './config.js';

export const CONFIG = {
  // Target server
  BASE_URL: __ENV.BASE_URL || 'http://localhost:3000',
  WS_URL: __ENV.WS_URL || 'ws://localhost:3000',

  // Auth
  ADMIN_PUBLIC_KEY: __ENV.ADMIN_PUBLIC_KEY || 'GCTEST000000000000000000000000000000000000000000000000000',

  // Test market ID (set via env or use default)
  MARKET_ID: __ENV.MARKET_ID || 'test-market-1',

  // Timing
  RAMP_UP_DURATION: '30s',
  STEADY_STATE_DURATION: '2m',
  RAMP_DOWN_DURATION: '15s',

  // Rate limit aware — the API has 100 req/min per IP
  API_RATE_LIMIT: 100,
};

// Shared k6 thresholds for pass/fail criteria
export const THRESHOLDS = {
  // HTTP request duration targets
  http_req_duration: [
    'p(50)<200',   // p50 under 200ms
    'p(95)<500',   // p95 under 500ms
    'p(99)<1000',  // p99 under 1s
  ],
  // HTTP request failure rate
  http_req_failed: [
    'rate<0.05',   // Less than 5% failure rate
  ],
  // Custom metric thresholds (defined per-scenario)
};

// Common HTTP params
export const HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

// Generate a fake Stellar public key for load testing
export function generatePublicKey(vuId) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let key = 'G';
  const seed = `${vuId}-${Date.now()}`;
  for (let i = 0; i < 55; i++) {
    key += chars[(vuId * 7 + i * 13) % chars.length];
  }
  return key;
}
