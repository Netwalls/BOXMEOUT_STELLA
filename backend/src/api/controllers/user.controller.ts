import { Request, Response } from "express";
import * as userService from "../../services/user.service";

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
      res.status(404).json({ error: "User not found", code: "NOT_FOUND" });
      return;
    }

    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user", code: "INTERNAL_ERROR" });
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
    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ error: "Failed to update user", code: "INTERNAL_ERROR" });
  }
}

/**
 * GET /api/users/:address/bets
 * Cursor-paginated list of bets placed by the given wallet address.
 * Query: ?cursor=&limit= (max 100). Ordered stably by (placedAt, id).
 */
export async function getUserBetsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { address } = req.params;
    const { cursor } = req.query;

    const parsedLimit = Number.parseInt(String(req.query.limit ?? ""), 10);
    const limit = Number.isNaN(parsedLimit)
      ? DEFAULT_LIMIT
      : Math.min(Math.max(parsedLimit, 1), MAX_LIMIT);

    const { bets, nextCursor } = await userService.getUserBets(address, {
      cursor: typeof cursor === "string" && cursor.length > 0 ? cursor : undefined,
      limit,
    });

    res.status(200).json({ bets, nextCursor });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user bets", code: "INTERNAL_ERROR" });
  }
}
