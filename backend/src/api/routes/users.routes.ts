import { Router } from "express";
import {
  getUserHandler,
  updateUserHandler,
  getUserBetsHandler,
  getUserPositionsHandler,
} from "../controllers/bet.controller";
import { requireOwnAddress, walletAuthMiddleware } from "../middleware/walletAuth.middleware";

const router = Router();

// GET /api/users/:address           — user profile (#1223 B-45)
router.get("/:address", getUserHandler);

// PUT /api/users/:address           — update profile, must own the address (#1223 B-45)
// Empty whitelist: the admin whitelist (ADMIN_WALLET_ADDRESSES) does not apply to profile owners.
router.put(
  "/:address",
  walletAuthMiddleware({ whitelist: [] }),
  requireOwnAddress,
  updateUserHandler
);

// GET /api/users/:address/bets      — cursor-paginated bet history (#1088, #1244)
router.get("/:address/bets", getUserBetsHandler);

// GET /api/users/:address/positions — paginated open positions (#1088)
router.get("/:address/positions", getUserPositionsHandler);

export default router;
