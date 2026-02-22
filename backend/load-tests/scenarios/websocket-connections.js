// =============================================================================
// WebSocket Connection Stress Test — 1000 Concurrent Connections
// =============================================================================
// Tests the system's ability to handle 1000 concurrent WebSocket connections.
// Each VU opens a WebSocket, subscribes to a market, and listens for events.
//
// Run: k6 run scenarios/websocket-connections.js
// Env: BASE_URL, WS_URL, MARKET_ID
// =============================================================================
import { check, sleep } from 'k6';
import ws from 'k6/ws';
import { Trend, Rate, Counter, Gauge } from 'k6/metrics';
import { CONFIG, generatePublicKey } from '../config.js';

// Custom metrics
const wsConnectDuration = new Trend('ws_connect_duration', true);
const wsMessageLatency = new Trend('ws_message_latency', true);
const wsConnections = new Gauge('ws_active_connections');
const wsErrors = new Rate('ws_error_rate');
const wsMessagesReceived = new Counter('ws_messages_received');
const wsConnectionsFailed = new Counter('ws_connections_failed');
const wsConnectionsOpened = new Counter('ws_connections_opened');

export const options = {
  scenarios: {
    websocket_ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },    // Phase 1: 100 connections
        { duration: '30s', target: 500 },    // Phase 2: 500 connections
        { duration: '30s', target: 1000 },   // Phase 3: 1000 connections
        { duration: '2m', target: 1000 },    // Sustain 1000 connections
        { duration: '30s', target: 0 },      // Ramp down
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    ws_connect_duration: ['p(95)<2000'],      // Connection established under 2s
    ws_error_rate: ['rate<0.10'],             // Less than 10% connection errors
    ws_message_latency: ['p(95)<500'],        // Messages received under 500ms
  },
};

export default function () {
  const vuId = __VU;
  const marketId = CONFIG.MARKET_ID;
  const wsUrl = `${CONFIG.WS_URL}/markets?marketId=${marketId}&vu=${vuId}`;

  const connectStart = Date.now();

  const res = ws.connect(wsUrl, null, function (socket) {
    const connectDuration = Date.now() - connectStart;
    wsConnectDuration.add(connectDuration);
    wsConnectionsOpened.add(1);
    wsConnections.add(1);

    // Track time of last ping for heartbeat
    let lastPing = Date.now();

    socket.on('open', function () {
      check(null, { 'ws: connection opened': () => true });

      // Subscribe to market updates
      socket.send(JSON.stringify({
        type: 'subscribe_market',
        marketId: marketId,
      }));

      // Send periodic heartbeats (every 25s, server expects 30s)
      socket.setInterval(function () {
        socket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        lastPing = Date.now();
      }, 25000);
    });

    socket.on('message', function (msg) {
      wsMessagesReceived.add(1);

      try {
        const data = JSON.parse(msg);

        // Measure latency for server-initiated messages
        if (data.timestamp) {
          const latency = Date.now() - data.timestamp;
          wsMessageLatency.add(latency);
        }

        // Handle pong responses
        if (data.type === 'pong') {
          const roundTrip = Date.now() - lastPing;
          wsMessageLatency.add(roundTrip);
        }

        check(data, {
          'ws: message has type': (d) => !!d.type,
        });
      } catch {
        // Binary or non-JSON message
      }
    });

    socket.on('error', function (e) {
      wsErrors.add(true);
      wsConnectionsFailed.add(1);
    });

    socket.on('close', function () {
      wsConnections.add(-1);
    });

    // Keep connection alive for the duration of the test iteration
    // Each VU will hold its connection for ~60s then reconnect
    socket.setTimeout(function () {
      // Unsubscribe before closing
      socket.send(JSON.stringify({
        type: 'unsubscribe_market',
        marketId: marketId,
      }));
      socket.close();
    }, 60000);
  });

  // If connection failed immediately
  if (res === null || (res && res.status !== 101)) {
    wsErrors.add(true);
    wsConnectionsFailed.add(1);
  }

  // Brief pause before reconnecting
  sleep(2);
}

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    scenario: 'websocket-connections',
    target_connections: 1000,
    metrics: {},
  };

  const metricNames = [
    'ws_connect_duration',
    'ws_message_latency',
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

  if (data.metrics.ws_active_connections) {
    summary.metrics.peak_connections = data.metrics.ws_active_connections.values.max;
  }
  if (data.metrics.ws_connections_opened) {
    summary.metrics.total_connections = data.metrics.ws_connections_opened.values.count;
  }
  if (data.metrics.ws_connections_failed) {
    summary.metrics.failed_connections = data.metrics.ws_connections_failed.values.count;
  }
  if (data.metrics.ws_error_rate) {
    summary.metrics.error_rate = data.metrics.ws_error_rate.values.rate;
  }

  return {
    'results/websocket-connections.json': JSON.stringify(summary, null, 2),
  };
}
