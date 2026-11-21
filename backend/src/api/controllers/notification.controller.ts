import type { Request, Response } from "express";
import { z } from "zod";
import { logger } from "../../logger";
import * as notificationService from "../../services/notification.service";
import { ok, fail } from "../response";

const listQuerySchema = z.object({
  unread: z.enum(["true", "false"]).optional(),
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(notificationService.NOTIFICATION_MAX_PAGE_SIZE).optional(),
});

const readBodySchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(100).optional(),
});

/** GET /api/users/:address/notifications?unread=true&cursor=&limit= */
export async function getNotificationsHandler(req: Request, res: Response): Promise<void> {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    fail(res, 400, "VALIDATION_ERROR", "Validation failed", { details: parsed.error.flatten() });
    return;
  }

  try {
    const page = await notificationService.listNotifications(req.params.address, {
      unreadOnly: parsed.data.unread === "true",
      cursor: parsed.data.cursor,
      limit: parsed.data.limit,
    });
    ok(res, page.items, { meta: { nextCursor: page.nextCursor } });
  } catch (err) {
    logger.error({ err }, "Failed to list notifications");
    fail(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
}

/** POST /api/users/:address/notifications/read  body: { ids?: string[] } (omit ids to mark all) */
export async function markNotificationsReadHandler(req: Request, res: Response): Promise<void> {
  const parsed = readBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    fail(res, 400, "VALIDATION_ERROR", "Validation failed", { details: parsed.error.flatten() });
    return;
  }

  try {
    const updated = await notificationService.markNotificationsRead(
      req.params.address,
      parsed.data.ids,
    );
    ok(res, { updated });
  } catch (err) {
    logger.error({ err }, "Failed to mark notifications read");
    fail(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
}
