import { Router } from "express";
import {
  searchMarketsHandler,
  getMarketsHandler,
  getMarketByIdHandler,
  getMarketStatsHandler,
  getMarketBetsHandler,
  resolveMarketHandler,
  resolveDisputeHandler,
  getPendingResolutionsHandler,
} from "../controllers/market.controller";

const router = Router();

// Public
router.get("/search", searchMarketsHandler);   // must be before /:id
router.get("/", getMarketsHandler);
router.get("/:id", getMarketByIdHandler);
router.get("/:id/stats", getMarketStatsHandler);
router.get("/:id/bets", getMarketBetsHandler);

// Admin
router.post("/admin/markets/resolve", resolveMarketHandler);
router.post("/admin/markets/dispute/resolve", resolveDisputeHandler);
router.get("/admin/markets/pending", getPendingResolutionsHandler);

export default router;
