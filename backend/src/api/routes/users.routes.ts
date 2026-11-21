import { Router } from "express";
import { getUserPositionsHandler } from "../controllers/bet.controller";
import {
  getUserHandler,
  updateUserHandler,
  getUserBetsHandler,
  getUserActivityHandler,
} from "../controllers/user.controller";
import { requireOwnAddress, walletAuthMiddleware } from "../middleware/walletAuth.middleware";
import { validate } from "../middleware/validate";
import { addressParams, pagedQuery, userBetsQuery } from "../schemas/routes.schema";

// B-130: every route validates :address and its query. The PUT body is covered by B-159.
const addressGuard = validate({ params: addressParams });

const router = Router();

// GET /api/users/:address           — user profile (#1223 B-45)
router.get("/:address", addressGuard, getUserHandler);

// PUT /api/users/:address           — update profile, must own the address (#1223 B-45)
// Empty whitelist: the admin whitelist (ADMIN_WALLET_ADDRESSES) does not apply to profile owners.
router.put(
  "/:address",
  addressGuard,
  walletAuthMiddleware({ whitelist: [] }),
  requireOwnAddress,
  updateUserHandler
);

// GET /api/users/:address/bets      — cursor-paginated bet history (#1088, #1244)
router.get("/:address/bets", validate({ params: addressParams, query: userBetsQuery }), getUserBetsHandler);

// GET /api/users/:address/activity  — unified bets/claims/refunds/disputes feed (#1588 B-152)
router.get("/:address/activity", getUserActivityHandler);

// GET /api/users/:address/positions — paginated open positions (#1088)
router.get("/:address/positions", validate({ params: addressParams, query: pagedQuery }), getUserPositionsHandler);

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

// GET /api/users/:address/watchlist — owner-only (#1570 B-134)
router.get(
  "/:address/watchlist",
  walletAuthMiddleware({ whitelist: [] }),
  requireOwnAddress,
  getWatchlistHandler
);

// PUT /api/users/:address/watchlist/:marketId — owner-only, idempotent, capped (#1570 B-134)
router.put(
  "/:address/watchlist/:marketId",
  walletAuthMiddleware({ whitelist: [] }),
  requireOwnAddress,
  putWatchlistHandler
);

// DELETE /api/users/:address/watchlist/:marketId — owner-only, idempotent (#1570 B-134)
router.delete(
  "/:address/watchlist/:marketId",
  walletAuthMiddleware({ whitelist: [] }),
  requireOwnAddress,
  deleteWatchlistHandler
);

export default router;
