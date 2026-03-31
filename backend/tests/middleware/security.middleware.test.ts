import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

/**
 * Unit tests for security middleware behaviour.
 * We instantiate the middleware directly here so tests are self-contained
 * and don't depend on module-level env evaluation timing.
 */

function buildApp(corsOrigins: string[]) {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'https://horizon-testnet.stellar.org'],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      frameguard: { action: 'deny' },
      noSniff: true,
    })
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || corsOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS: origin '${origin}' not allowed`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page'],
      optionsSuccessStatus: 204,
    })
  );

  app.get('/test', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('security.middleware', () => {
  const ORIGIN = 'http://localhost:5173';
  let app: express.Application;

  beforeAll(() => {
    app = buildApp([ORIGIN]);
  });

  it('sets X-Content-Type-Options: nosniff via Helmet', async () => {
    const res = await request(app).get('/test').set('Origin', ORIGIN);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets X-Frame-Options: DENY via Helmet frameguard', async () => {
    const res = await request(app).get('/test').set('Origin', ORIGIN);
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('sets Strict-Transport-Security (HSTS) via Helmet', async () => {
    const res = await request(app).get('/test').set('Origin', ORIGIN);
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
  });

  it('sets Content-Security-Policy via Helmet', async () => {
    const res = await request(app).get('/test').set('Origin', ORIGIN);
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('allows whitelisted CORS origin', async () => {
    const res = await request(app).get('/test').set('Origin', ORIGIN);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
  });

  it('blocks non-whitelisted CORS origin', async () => {
    const res = await request(app).get('/test').set('Origin', 'http://evil.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('supports multiple whitelisted origins', async () => {
    const multiApp = buildApp([ORIGIN, 'https://app.example.com']);

    const res1 = await request(multiApp).get('/test').set('Origin', ORIGIN);
    expect(res1.headers['access-control-allow-origin']).toBe(ORIGIN);

    const res2 = await request(multiApp).get('/test').set('Origin', 'https://app.example.com');
    expect(res2.headers['access-control-allow-origin']).toBe('https://app.example.com');
  });

  it('handles OPTIONS preflight with 204 and CORS headers', async () => {
    const res = await request(app)
      .options('/test')
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'POST');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
  });
});
