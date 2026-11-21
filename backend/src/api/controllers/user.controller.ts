import { Request, Response } from "express";
import * as userService from "../../services/user.service";
import { cursorMeta, cursorQuerySchema } from "../schemas/pagination";
import { ok, fail } from "../response";

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

/** B-159: profile body rules, with the avatar host allowlist taken from config. */
const updateUserSchema = buildUpdateUserSchema({
  avatarHostAllowlist: config.AVATAR_HOST_ALLOWLIST,
});

/**
 * PUT /api/users/:address
 * Body: { displayName?, avatarUrl? } (unknown keys are rejected).
 * Requires wallet-signature auth matching :address.
 * Invalid input returns 400 VALIDATION_ERROR and never reaches the service.
 */
export async function updateUserHandler(req: Request, res: Response): Promise<void> {
  const parsed = updateUserSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    fail(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid profile", {
      details: parsed.error.flatten(),
    });
    return;
  }

  try {
    const { address } = req.params;
    const { displayName, avatarUrl } = parsed.data;

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

/**
 * GET /api/users/:address/activity  (#1588, B-152)
 * Unified feed of bets placed, winnings claimed, refunds claimed and disputes
 * raised, newest first. Query: ?cursor=&limit= (limit max 100).
 * An empty address returns an empty page. A malformed cursor returns 400.
 */
export async function getUserActivityHandler(req: Request, res: Response): Promise<void> {
  const parsed = cursorQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    fail(res, 400, "VALIDATION_ERROR", "Validation failed", { details: parsed.error.flatten() });
    return;
  }

  try {
    const { address } = req.params;
    const { cursor, limit } = parsed.data;
    const page = await userService.getUserActivity(address, {
      cursor: cursor || undefined,
      limit,
    });
    ok(res, page.items, { meta: { ...cursorMeta(page.nextCursor) } });
  } catch (error) {
    if (error instanceof userService.InvalidActivityCursorError) {
      fail(res, 400, "INVALID_CURSOR", "cursor is malformed");
      return;
    }
    fail(res, 500, "INTERNAL_ERROR", "Failed to fetch user activity");
  }
}
