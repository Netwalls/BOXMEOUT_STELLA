// backend/tests/metrics.test.ts - Tests for Prometheus metrics
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app, { startServer } from '../src/index.js';

describe('Metrics Endpoint', () => {
  it('should expose /metrics endpoint', async () => {
    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
  });

  it('should return Prometheus format metrics', async () => {
    const response = await request(app).get('/metrics');

    const body = response.text;

    // Check for default Node.js metrics
    expect(body).toContain('process_cpu_user_seconds_total');
    expect(body).toContain('nodejs_heap_size_used_bytes');

    // Check for custom HTTP metrics
    expect(body).toContain('http_request_duration_seconds');
    expect(body).toContain('http_requests_total');
  });

  it('should track HTTP requests', async () => {
    // Make a request to generate metrics
    await request(app).get('/health');

    // Check metrics
    const response = await request(app).get('/metrics');
    const body = response.text;

    expect(body).toContain('http_request_duration_seconds');
    expect(body).toContain('http_requests_total');
  });

  it('should include blockchain metrics definitions', async () => {
    const response = await request(app).get('/metrics');
    const body = response.text;

    expect(body).toContain('blockchain_call_duration_seconds');
    expect(body).toContain('blockchain_calls_total');
  });

  it('should include WebSocket metrics definitions', async () => {
    const response = await request(app).get('/metrics');
    const body = response.text;

    expect(body).toContain('websocket_connections_active');
    expect(body).toContain('websocket_connections_total');
  });

  it('should include prediction metrics definitions', async () => {
    const response = await request(app).get('/metrics');
    const body = response.text;

    expect(body).toContain('predictions_total');
    expect(body).toContain('prediction_commit_duration_seconds');
    expect(body).toContain('prediction_reveal_duration_seconds');
  });

  it('should include trade metrics definitions', async () => {
    const response = await request(app).get('/metrics');
    const body = response.text;

    expect(body).toContain('trade_volume_usdc_total');
    expect(body).toContain('trades_total');
    expect(body).toContain('trade_duration_seconds');
  });

  it('should include error metrics definitions', async () => {
    const response = await request(app).get('/metrics');
    const body = response.text;

    expect(body).toContain('errors_total');
  });
});

describe('Metrics Middleware', () => {
  it('should track request duration', async () => {
    const response1 = await request(app).get('/health');
    expect(response1.status).toBe(200);

    const response2 = await request(app).get('/metrics');
    const body = response2.text;

    // Should have tracked the /health request
    expect(body).toMatch(/http_request_duration_seconds.*method="GET"/);
  });

  it('should track error responses', async () => {
    // Make a request to non-existent endpoint
    await request(app).get('/api/nonexistent');

    const response = await request(app).get('/metrics');
    const body = response.text;

    // Should track the error
    expect(body).toContain('errors_total');
  });
});
