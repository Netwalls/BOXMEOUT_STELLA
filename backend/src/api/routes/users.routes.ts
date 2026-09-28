import { Router } from "express";
import { getUserHandler, updateUserHandler } from "../controllers/user.controller";
import {
  getUserBetsHandler,
  getUserPositionsHandler,
} from "../controllers/bet.controller";
import { requireWalletAuth } from "../middleware/auth";

const router = Router();

// GET /api/users/:address           — user profile (#1223 B-45)
router.get("/:address", getUserHandler);

// PUT /api/users/:address           — update profile, must own the address (#1223 B-45)
router.put("/:address", requireWalletAuth, updateUserHandler);

// GET /api/users/:address/bets      — paginated bet history (#1088)
router.get("/:address/bets", getUserBetsHandler);

// GET /api/users/:address/positions — paginated open positions (#1088)
router.get("/:address/positions", getUserPositionsHandler);

export default router;
