import { Request, Response } from "express";
import * as userService from "../../services/user.service";
import { ok, fail } from "../response";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

/**
 * GET /api/users/:address
 * Returns user profile data for the given wallet address.
 */
export async function getUserHandler(req: Request, res: Response): Promise<void> {
  try {
    const { address } = req.params;

    const user = await userService.getUserByAddress(address);

    if (!user) {
      fail(res, 404, "NOT_FOUND", "User not found");
      return;
    }

    ok(res, user);
  } catch (error) {
    fail(res, 500, "INTERNAL_ERROR", "Failed to fetch user");
  }
}

/**
 * PUT /api/users/:address
 * Body: { displayName?, avatarUrl? }
 * Requires wallet-signature auth matching :address.
 */
export async function updateUserHandler(req: Request, res: Response): Promise<void> {
  try {
    const { address } = req.params;
    const { displayName, avatarUrl } = req.body;

    const user = await userService.updateUser(address, { displayName, avatarUrl });
    ok(res, user);
  } catch (error) {
    fail(res, 500, "INTERNAL_ERROR", "Failed to update user");
  }
}

/**
 * GET /api/users/:address/bets
 * Cursor-paginated list of bets placed by the given wallet address.
 * Query: ?cursor=&limit= (max 100). Ordered stably by (placedAt, id).
 */
export async function getUserBetsHandler(req: Request, res: Response): Promise<void> {
  const parsed = cursorQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
    return;
  }

  try {
    const { address } = req.params;
    const { cursor, limit } = parsed.data;

    const { bets, nextCursor } = await userService.getUserBets(address, {
      cursor: cursor || undefined,
      limit,
    });

    ok(res, bets, { meta: { nextCursor } });
  } catch (error) {
    fail(res, 500, "INTERNAL_ERROR", "Failed to fetch user bets");
  }
}
