import { Request, Response, NextFunction } from "express";
import * as webhookService from "../../services/webhook.service";
import { ok, fail } from "../response";

/** Maps service validation failures to 400; anything else is passed on. */
function handleWebhookError(err: unknown, res: Response, next: NextFunction): void {
  if (
    err instanceof webhookService.WebhookUrlError ||
    err instanceof webhookService.WebhookValidationError
  ) {
    fail(res, 400, "VALIDATION_ERROR", err.message);
    return;
  }
  next(err);
}

/** POST /api/admin/webhooks — the signing secret is returned only in this response. */
export async function createWebhookHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { url, eventTypes } = (req.body ?? {}) as { url?: unknown; eventTypes?: unknown };
    if (typeof url !== "string" || url.length === 0) {
      fail(res, 400, "VALIDATION_ERROR", "Missing required field: url");
      return;
    }
    const endpoint = await webhookService.createWebhookEndpoint(url, eventTypes);
    ok(res, endpoint, { status: 201 });
  } catch (err) {
    handleWebhookError(err, res, next);
  }
}

/** GET /api/admin/webhooks */
export async function listWebhooksHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await webhookService.listWebhookEndpoints());
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/webhooks/:id — body: { url?, eventTypes?, active? } */
export async function updateWebhookHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = (req.body ?? {}) as { url?: unknown; eventTypes?: unknown; active?: unknown };
    if (body.active !== undefined && typeof body.active !== "boolean") {
      fail(res, 400, "VALIDATION_ERROR", "active must be a boolean");
      return;
    }
    if (body.url !== undefined && typeof body.url !== "string") {
      fail(res, 400, "VALIDATION_ERROR", "url must be a string");
      return;
    }
    const updated = await webhookService.updateWebhookEndpoint(req.params.id, {
      url: body.url as string | undefined,
      eventTypes: body.eventTypes,
      active: body.active as boolean | undefined,
    });
    ok(res, updated);
  } catch (err) {
    handleWebhookError(err, res, next);
  }
}

/** DELETE /api/admin/webhooks/:id */
export async function deleteWebhookHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await webhookService.deleteWebhookEndpoint(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/webhooks/:id/deliveries?limit=50 (max 200) */
export async function listWebhookDeliveriesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const requested = Number(req.query.limit ?? 50);
    const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 200) : 50;
    ok(res, await webhookService.listWebhookDeliveries(req.params.id, limit));
  } catch (err) {
    next(err);
  }
}
