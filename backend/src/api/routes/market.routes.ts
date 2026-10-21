import { Router, type Request, type Response } from "express";
import { searchMarketsHandler } from "../controllers/marketSearch.controller";
import {
  getMarketsHandler,
  getMarketByIdHandler,
  getMarketStatsHandler,
  getMarketBetsHandler,
  getMarketOddsHistoryHandler,
  createMarketHandler,
} from "../controllers/market.controller";
import { createMarketSchema } from "../schemas/market.schema";
import { walletAuthMiddleware } from "../middleware/walletAuth.middleware";
import { idempotencyMiddleware } from "../middleware/idempotency.middleware";
import { validate } from "../middleware/validate";
import { subscribeToMarket, type MarketEventPayload } from "../../events/marketEvents";

// B-99 (#1397): search is unauthenticated and runs a full-text query per call,
// so it gets the shared Redis sliding-window limiter.
const searchRateLimiter = rateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 60,
  keyPrefix: "markets:search",
});

const router = Router();

const HEARTBEAT_INTERVAL_MS = 15_000;

// GET /api/markets/search?q=...  — must come before /:id (#1405 B-107)
router.get("/search", searchRateLimiter, searchMarketsHandler);

// GET  /api/markets
router.get("/", getMarketsHandler);

// POST /api/markets
// Creator must prove wallet ownership via challenge/response (#1225 B-47).
// Optional Idempotency-Key (B-103) makes client retries safe; it runs after auth
// so keys are scoped to the wallet. Body is validated with zod before the handler.
router.post(
  "/",
  walletAuthMiddleware(),
  idempotencyMiddleware(),
  validate({ body: createMarketSchema }),
  enforceCreatorBinding,
  createMarketHandler,
);

// GET /api/markets/:id/stream — Server-Sent Events for live pool/status updates
router.get("/:id/stream", (req: Request, res: Response) => {
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

  // Map internal bus event types onto the SSE event names clients subscribe to.
  const onMarketEvent = (payload: MarketEventPayload) => {
    if (payload.type === "pool_updated") send("pool", payload.data);
    else if (payload.type === "status_changed") send("status", payload.data);
  };

  const unsubscribe = subscribeToMarket(id, onMarketEvent);

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, HEARTBEAT_INTERVAL_MS);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
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

// GET /api/markets/:id/odds-history?interval=5m|1h
router.get("/:id/odds-history", getMarketOddsHistoryHandler);

export default router;
