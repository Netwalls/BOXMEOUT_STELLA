import express from "express";
import http from "http";
import type { AddressInfo } from "net";
import request from "supertest";
import { redis } from "../../../lib/redis";
import { requestIdMiddleware } from "../requestId.middleware";
import {
  keyByAddressQuery,
  rateLimitMiddleware,
  sseConnectionLimit,
} from "../rateLimit.middleware";

// Each test uses its own key prefix so Redis state from earlier runs or tests
// never affects the counts asserted here.
let testRun = 0;
function uniquePrefix(name: string): string {
  testRun += 1;
  return `test:${name}:${Date.now()}:${testRun}`;
}

function buildApp(middleware: express.RequestHandler): express.Application {
  const app = express();
  app.set("trust proxy", true);
  app.use(requestIdMiddleware);
  app.get("/limited", middleware, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

afterAll(async () => {
  await redis.quit();
});

describe("rateLimitMiddleware", () => {
  it("allows requests up to max, then returns 429 with the standard envelope", async () => {
    const app = buildApp(
      rateLimitMiddleware({ windowMs: 60_000, max: 2, keyPrefix: uniquePrefix("envelope") }),
    );

    await request(app).get("/limited").expect(200);
    await request(app).get("/limited").expect(200);

    const res = await request(app).get("/limited").expect(429);

    expect(res.body).toEqual({
      error: "Too many requests",
      code: "RATE_LIMITED",
      retryAfter: expect.any(Number),
      requestId: expect.any(String),
    });
    expect(res.body.retryAfter).toBeGreaterThanOrEqual(1);
    expect(res.headers["retry-after"]).toBe(String(res.body.retryAfter));
  });

  it("echoes the incoming X-Request-Id in the 429 body", async () => {
    const app = buildApp(
      rateLimitMiddleware({ windowMs: 60_000, max: 0, keyPrefix: uniquePrefix("requestid") }),
    );

    const res = await request(app).get("/limited").set("X-Request-Id", "req-1397").expect(429);

    expect(res.body.requestId).toBe("req-1397");
  });

  it("keeps separate counters for separate keys", async () => {
    const keyPrefix = uniquePrefix("keys");
    const app = express();
    app.set("trust proxy", true);
    app.get(
      "/limited",
      rateLimitMiddleware({ windowMs: 60_000, max: 1, keyPrefix, keyGenerator: keyByAddressQuery }),
      (_req, res) => {
        res.json({ ok: true });
      },
    );

    await request(app).get("/limited?address=GAAA").expect(200);
    await request(app).get("/limited?address=GAAA").expect(429);
    await request(app).get("/limited?address=GBBB").expect(200);
  });

  it("fails open when Redis is unavailable", async () => {
    const app = buildApp(
      rateLimitMiddleware({ windowMs: 60_000, max: 0, keyPrefix: uniquePrefix("failopen") }),
    );
    const spy = jest.spyOn(redis, "multi").mockImplementation(() => {
      throw new Error("redis down");
    });

    try {
      await request(app).get("/limited").expect(200);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("sseConnectionLimit", () => {
  function startServer(app: express.Application): Promise<{ server: http.Server; port: number }> {
    return new Promise((resolve) => {
      const server = app.listen(0, () => {
        resolve({ server, port: (server.address() as AddressInfo).port });
      });
    });
  }

  function openStream(port: number): Promise<http.ClientRequest> {
    return new Promise((resolve, reject) => {
      const req = http.get({ host: "127.0.0.1", port, path: "/stream" }, (res) => {
        expect(res.statusCode).toBe(200);
        resolve(req);
      });
      req.on("error", reject);
    });
  }

  function closeStream(req: http.ClientRequest): Promise<void> {
    return new Promise((resolve) => {
      req.on("close", () => resolve());
      req.destroy();
    });
  }

  it("caps open streams per IP and frees a slot when a client disconnects", async () => {
    const app = express();
    app.get(
      "/stream",
      sseConnectionLimit({ max: 2, keyPrefix: uniquePrefix("sse"), ttlSeconds: 60 }),
      (_req, res) => {
        res.setHeader("Content-Type", "text/event-stream");
        res.flushHeaders();
        res.write(": connected\n\n");
      },
    );

    const { server, port } = await startServer(app);
    try {
      const first = await openStream(port);
      const second = await openStream(port);

      const blocked = await fetch(`http://127.0.0.1:${port}/stream`);
      expect(blocked.status).toBe(429);
      const body = (await blocked.json()) as { code: string };
      expect(body.code).toBe("RATE_LIMITED");

      await closeStream(first);
      // The server decrements on socket close, which can land a tick after the client sees it.
      await new Promise((r) => setTimeout(r, 100));

      const third = await openStream(port);

      await closeStream(second);
      await closeStream(third);
    } finally {
      server.close();
    }
  });
});
