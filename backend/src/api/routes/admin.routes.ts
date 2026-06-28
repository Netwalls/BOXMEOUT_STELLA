import { Router } from "express";
import {
  getPendingResolutionsHandler,
  resolveMarketHandler,
  resolveDisputeHandler,
} from "../controllers/market.controller";
import {
  getAllOraclesHandler,
  createOracleHandler,
  updateOracleHandler,
  deleteOracleHandler,
} from "../controllers/oracle.controller";

const router = Router();

// Market management
router.get("/markets/pending", getPendingResolutionsHandler);
router.post("/markets/resolve", resolveMarketHandler);
router.post("/markets/dispute/resolve", resolveDisputeHandler);

// Oracle address management (Issue #455)
router.get("/oracles", getAllOraclesHandler);
router.post("/oracles", createOracleHandler);
router.patch("/oracles/:id", updateOracleHandler);
router.delete("/oracles/:id", deleteOracleHandler);

export default router;
