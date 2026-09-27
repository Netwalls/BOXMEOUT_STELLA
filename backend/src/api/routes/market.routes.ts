import { Router, type Request, type Response } from "express";
import {
  searchMarketsHandler,
  getMarketsHandler,
  getMarketsByCreatorHandler,
  getMarketByIdHandler,
  getMarketStatsHandler,
  getMarketBetsHandler,
  createMarketHandler,
} from "../controllers/market.controller";
import { marketEvents } from "../../events/marketEvents";

const router = Router();

const HEARTBEAT_INTERVAL_MS = 15_000;

// GET /api/markets/search?q=...  — must come before /:id
router.get("/search", searchMarketsHandler);

// GET  /api/markets
// POST /api/markets
router.get("/", getMarketsHandler);
router.post("/", createMarketHandler);

// GET /api/markets/:id/stream — Server-Sent Events for live pool/status updates
router.get("/:id/stream", (req: Request, res: Response) => {
  const { id } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Initial comment so clients/proxies open the stream immediately.
  res.write(": connected\n\n");

  const onPoolChange = (payload: unknown) => send("pool", payload);
  const onStatusChange = (payload: unknown) => send("status", payload);

  marketEvents.on("pool", onPoolChange);
  marketEvents.on("status", onStatusChange);

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, HEARTBEAT_INTERVAL_MS);

  const cleanup = () => {
    clearInterval(heartbeat);
    marketEvents.off("pool", onPoolChange);
    marketEvents.off("status", onStatusChange);
  };

  req.on("close", cleanup);
  res.on("close", cleanup);
});

// GET /api/markets/:id
router.get("/:id", getMarketByIdHandler);

// GET /api/markets/:id/stats
router.get("/:id/stats", getMarketStatsHandler);

// GET /api/markets/:id/bets
router.get("/:id/bets", getMarketBetsHandler);

export default router;
