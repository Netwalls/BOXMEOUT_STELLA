import { Router } from "express";
import {
  getUserHandler,
  updateUserHandler,
  getUserBetsHandler,
} from "../controllers/user.controller";
import { getUserPositionsHandler } from "../controllers/bet.controller";
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

// GET /api/users/:address/positions — paginated open positions (#1088)
router.get("/:address/positions", validate({ params: addressParams, query: pagedQuery }), getUserPositionsHandler);

export default router;
