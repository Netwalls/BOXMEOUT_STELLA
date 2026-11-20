import { Router } from "express";
import {
  getUserHandler,
  updateUserHandler,
  getUserBetsHandler,
} from "../controllers/user.controller";
import { getUserPositionsHandler } from "../controllers/bet.controller";
import { requireOwnAddress, walletAuthMiddleware } from "../middleware/walletAuth.middleware";
import {
  getNotificationsHandler,
  markNotificationsReadHandler,
} from "../controllers/notification.controller";

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

// GET /api/users/:address/notifications — owner-only, cursor-paginated (#1569 B-133)
router.get(
  "/:address/notifications",
  walletAuthMiddleware({ whitelist: [] }),
  requireOwnAddress,
  getNotificationsHandler
);

// POST /api/users/:address/notifications/read — owner-only; body { ids? } (#1569 B-133)
router.post(
  "/:address/notifications/read",
  walletAuthMiddleware({ whitelist: [] }),
  requireOwnAddress,
  markNotificationsReadHandler
);

export default router;
