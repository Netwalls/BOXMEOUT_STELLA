import express from "express";
import request from "supertest";
import { createServer } from "http";
import {
  applyServerTimeouts,
  isLongLivedRoute,
  requestTimeoutMiddleware,
  TimeoutError,
  withTimeout,
} from "../lib/timeout";

describe("B-102: timeouts", () => {
  describe("withTimeout", () => {
    it("resolves with the value when the promise settles in time", async () => {
      await expect(withTimeout(Promise.resolve("ok"), 1_000, "fast")).resolves.toBe("ok");
    });

    it("rejects with a TimeoutError naming the operation when it does not settle", async () => {
      const never = new Promise<never>(() => {});

      const result = withTimeout(never, 20, "rpc getAccount");

      await expect(result).rejects.toBeInstanceOf(TimeoutError);
      await expect(result).rejects.toThrow("rpc getAccount timed out after 20 ms");
    });

    it("propagates the original rejection when the promise fails before the deadline", async () => {
      const failure = withTimeout(Promise.reject(new Error("boom")), 1_000, "fails");

      await expect(failure).rejects.toThrow("boom");
    });
  });

  describe("isLongLivedRoute", () => {
    it("treats SSE stream routes as long-lived and everything else as request/response", () => {
      expect(isLongLivedRoute("/api/markets/abc/stream")).toBe(true);
      expect(isLongLivedRoute("/api/markets/abc")).toBe(false);
    });
  });

  describe("requestTimeoutMiddleware", () => {
    it("answers 503 when a request exceeds the deadline", async () => {
      const app = express();
      app.use(requestTimeoutMiddleware(30));
      app.get("/slow", () => {
        // Never responds within the deadline.
      });

      const res = await request(app).get("/slow");

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: "Request timed out", code: "REQUEST_TIMEOUT" });
    });

    it("does not throw when the handler responds after the 503 was already sent", async () => {
      const app = express();
      app.use(requestTimeoutMiddleware(30));
      let lateSendError: unknown = null;
      app.get("/late", (_req, res) => {
        setTimeout(() => {
          try {
            res.status(200).json({ late: true });
          } catch (err) {
            lateSendError = err;
          }
        }, 120);
      });

      const res = await request(app).get("/late");
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(res.status).toBe(503);
      expect(lateSendError).toBeNull();
    });

    it("leaves SSE stream routes alone so long-lived connections are not cut off", async () => {
      const app = express();
      app.use(requestTimeoutMiddleware(30));
      app.get("/api/markets/:id/stream", (_req, res) => {
        setTimeout(() => res.json({ streamed: true }), 100);
      });

      const res = await request(app).get("/api/markets/m1/stream");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ streamed: true });
    });

    it("does not fire for requests that finish in time", async () => {
      const app = express();
      app.use(requestTimeoutMiddleware(200));
      app.get("/fast", (_req, res) => {
        res.json({ ok: true });
      });

      const res = await request(app).get("/fast");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });

  describe("applyServerTimeouts", () => {
    it("sets keep-alive, headers and request timeouts on the server", () => {
      const server = createServer();

      applyServerTimeouts(server, {
        keepAliveTimeoutMs: 5_000,
        headersTimeoutMs: 10_000,
        requestTimeoutMs: 30_000,
      });

      expect(server.keepAliveTimeout).toBe(5_000);
      expect(server.headersTimeout).toBe(10_000);
      expect(server.requestTimeout).toBe(30_000);
    });
  });
});
