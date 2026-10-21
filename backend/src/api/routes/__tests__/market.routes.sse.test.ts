/**
 * B-83: GET /api/markets/:id/stream must deliver `pool` events published on
 * the market event bus to connected SSE clients.
 */

import express from "express";
import http from "http";
import type { AddressInfo } from "net";

jest.mock("../../../services/oracle.service", () => ({}));
jest.mock("../../../services/market.service", () => ({}));
jest.mock("../../../repositories/market.repository", () => ({ searchMarkets: jest.fn() }));
jest.mock("../../../db", () => ({ db: { $queryRaw: jest.fn() } }));
jest.mock("../../middleware/walletAuth.middleware", () => ({
  walletAuthMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import marketRouter from "../market.routes";
import { publishMarketEvent } from "../../../events/marketEvents";

describe("GET /api/markets/:id/stream", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use("/api/markets", marketRouter);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("delivers a pool event published for the market", async () => {
    const marketId = "market-sse-1";

    const received = await new Promise<string>((resolve, reject) => {
      const req = http.get(`${baseUrl}/api/markets/${marketId}/stream`, (res) => {
        expect(res.headers["content-type"]).toContain("text/event-stream");

        let buffer = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          buffer += chunk;
          // Wait for the full frame (terminated by a blank line), not just the event name.
          if (/event: pool\ndata: .*\n\n/.test(buffer)) {
            req.destroy();
            resolve(buffer);
          }
        });
        res.on("error", reject);

        // Publish once the subscription is registered (after the connect comment).
        setImmediate(() =>
          publishMarketEvent(marketId, "pool_updated", { poolA: "10", poolB: "5" }),
        );
      });
      req.on("error", (err) => {
        if ((err as NodeJS.ErrnoException).code === "ECONNRESET") return;
        reject(err);
      });
      const timer = setTimeout(() => reject(new Error("timed out waiting for pool event")), 3000);
      timer.unref();
    });

    expect(received).toContain("event: pool\n");
    expect(received).toContain('"poolA":"10"');
    expect(received).toContain('"poolB":"5"');
  });
});
