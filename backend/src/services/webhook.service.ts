/**
 * B-145 / #1581: signed outbound webhooks for market events.
 *
 * Flow:
 *   1. A market event (`market.created`, `market.resolved`) calls
 *      `dispatchWebhookEvent`. One `WebhookDelivery` row is written per active
 *      endpoint subscribed to that event type, and a BullMQ job is queued with
 *      the delivery id as its job id (so a double enqueue is a no-op).
 *   2. The worker posts the JSON body to the endpoint with
 *      `X-Boxmeout-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>`
 *      plus an `X-Boxmeout-Event-Id` header that receivers use to deduplicate.
 *   3. Non-2xx responses and network errors are retried with exponential
 *      backoff. After the last attempt the delivery is marked `Failed`.
 *
 * SSRF protection (applied when an endpoint is created AND on every delivery):
 *   - https only, no embedded credentials, no localhost-style hostnames
 *   - every resolved address must be public (private, loopback, link-local,
 *     CGNAT, multicast and reserved ranges are refused, including IPv4-mapped
 *     IPv6 forms)
 *   - the connection is pinned to the address that passed the check, so a DNS
 *     rebind between validation and connect cannot reach an internal host
 *   - redirects are not followed; a 3xx is a failed delivery
 *   - short request timeout
 */
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import dns from "node:dns";
import https from "node:https";
import net from "node:net";
import { Prisma } from "@prisma/client";
import { Queue, Worker, Job, UnrecoverableError } from "bullmq";
import { db } from "../db";
import { logger } from "../logger";
import { webhookDeliveriesTotal } from "../metrics";

// ─── Config ───────────────────────────────────────────────────────────────────

export const WEBHOOK_EVENT_TYPES = ["market.created", "market.resolved"] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const WEBHOOK_QUEUE = "webhook-deliveries";
export const WEBHOOK_DELIVERY_JOB = "deliver-webhook";
/** Total delivery attempts (1 initial + retries). */
export const WEBHOOK_MAX_ATTEMPTS = 6;
/** Base delay for exponential backoff: 5s, 10s, 20s, 40s, 80s. */
export const WEBHOOK_BACKOFF_MS = 5_000;
export const WEBHOOK_TIMEOUT_MS = 5_000;
export const WEBHOOK_SIGNATURE_HEADER = "X-Boxmeout-Signature";
export const WEBHOOK_EVENT_ID_HEADER = "X-Boxmeout-Event-Id";
export const WEBHOOK_EVENT_TYPE_HEADER = "X-Boxmeout-Event-Type";

const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST ?? "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
};

// ─── Errors ───────────────────────────────────────────────────────────────────

/** The endpoint URL failed validation. Permanent: never retried. */
export class WebhookUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookUrlError";
  }
}

/** Request input is malformed (e.g. unknown event type). Mapped to 400. */
export class WebhookValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookValidationError";
  }
}

/** A delivery attempt failed in a way that may succeed on retry. */
export class WebhookDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookDeliveryError";
  }
}

// ─── SSRF protection ──────────────────────────────────────────────────────────

const blockList = new net.BlockList();
const BLOCKED_IPV4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];
const BLOCKED_IPV6: Array<[string, number]> = [
  ["::", 128],
  ["::", 96],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
];
for (const [addr, prefix] of BLOCKED_IPV4) blockList.addSubnet(addr, prefix, "ipv4");
for (const [addr, prefix] of BLOCKED_IPV6) blockList.addSubnet(addr, prefix, "ipv6");

/** Converts `::ffff:a.b.c.d` and `::ffff:xxxx:yyyy` to dotted IPv4, or returns null. */
function unmapIPv4(address: string): string | null {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (dotted) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
  }
  return null;
}

/** True when `address` is not a public unicast IP. Unparseable input is blocked. */
export function isBlockedAddress(address: string): boolean {
  const mapped = unmapIPv4(address);
  const candidate = mapped ?? address;
  const family = net.isIP(candidate);
  if (family === 4) return blockList.check(candidate, "ipv4");
  if (family === 6) return blockList.check(candidate, "ipv6");
  return true;
}

const BLOCKED_HOSTNAME_SUFFIXES = [".localhost", ".local", ".internal", ".localdomain"];

/** Synchronous checks on the URL itself. Returns the parsed URL. */
export function validateWebhookUrlSyntax(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebhookUrlError("webhook url is not a valid URL");
  }
  if (url.protocol !== "https:") {
    throw new WebhookUrlError("webhook url must use https");
  }
  if (url.username !== "" || url.password !== "") {
    throw new WebhookUrlError("webhook url must not contain credentials");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || BLOCKED_HOSTNAME_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new WebhookUrlError("webhook url must not point at a local hostname");
  }
  return url;
}

function bareHostname(url: URL): string {
  // WHATWG URL keeps brackets around IPv6 literals; the resolver wants them stripped.
  return url.hostname.replace(/^\[(.*)\]$/, "$1");
}

export interface PinnedTarget {
  url: URL;
  address: string;
  family: 4 | 6;
}

/**
 * Resolves the hostname and refuses the URL if ANY returned address is not
 * public. The first address is returned so the connection can be pinned to it.
 */
export async function resolvePublicTarget(url: URL): Promise<PinnedTarget> {
  const host = bareHostname(url);
  // IP literals are checked directly, never sent to the resolver.
  const literalFamily = net.isIP(host);
  if (literalFamily !== 0) {
    if (isBlockedAddress(host)) {
      throw new WebhookUrlError("webhook url resolves to a private or reserved address");
    }
    return { url, address: host, family: literalFamily === 6 ? 6 : 4 };
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = await dns.promises.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new WebhookUrlError("webhook hostname did not resolve");
  }
  if (records.length === 0) {
    throw new WebhookUrlError("webhook hostname did not resolve");
  }
  for (const record of records) {
    if (isBlockedAddress(record.address)) {
      throw new WebhookUrlError("webhook url resolves to a private or reserved address");
    }
  }
  const first = records[0];
  return { url, address: first.address, family: first.family === 6 ? 6 : 4 };
}

/** Full validation used on endpoint creation and before every delivery. */
export async function assertSafeWebhookUrl(raw: string): Promise<PinnedTarget> {
  return resolvePublicTarget(validateWebhookUrlSyntax(raw));
}

// ─── Signing ──────────────────────────────────────────────────────────────────

/** Hex HMAC-SHA256 over `${timestamp}.${body}`. */
export function signWebhookPayload(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** Header value: `t=<unix seconds>,v1=<hex signature>`. */
export function buildSignatureHeader(secret: string, timestamp: number, body: string): string {
  return `t=${timestamp},v1=${signWebhookPayload(secret, timestamp, body)}`;
}

/**
 * Receiver-side check. Returns false for malformed headers, a stale timestamp
 * (outside `toleranceSeconds`) or a signature mismatch.
 */
export function verifyWebhookSignature(
  secret: string,
  header: string,
  body: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const idx = part.indexOf("=");
      return [part.slice(0, idx), part.slice(idx + 1)];
    }),
  );
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || !parts.v1) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;

  const expected = Buffer.from(signWebhookPayload(secret, timestamp, body), "hex");
  const received = Buffer.from(parts.v1, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

// ─── Queue ────────────────────────────────────────────────────────────────────

let queue: Queue | null = null;

function getWebhookQueue(): Queue {
  if (!queue) {
    queue = new Queue(WEBHOOK_QUEUE, {
      connection: REDIS_CONNECTION,
      defaultJobOptions: {
        attempts: WEBHOOK_MAX_ATTEMPTS,
        backoff: { type: "exponential", delay: WEBHOOK_BACKOFF_MS },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });
  }
  return queue;
}

// ─── Enqueue ──────────────────────────────────────────────────────────────────

/**
 * Writes a delivery row for every active endpoint subscribed to `eventType`
 * and queues each one. Returns the number of deliveries created.
 */
export async function enqueueWebhookEvent(
  eventType: WebhookEventType,
  data: Record<string, unknown>,
  dedupeKey: string = randomUUID(),
): Promise<number> {
  // A stable dedupeKey (e.g. "market.created:<id>") makes re-indexed or retried
  // producers a no-op: the (endpointId, eventId) unique index rejects repeats.
  const eventId = dedupeKey;
  const body = {
    id: eventId,
    type: eventType,
    createdAt: new Date().toISOString(),
    data,
  } as Prisma.InputJsonObject;

  const endpoints = await db.webhookEndpoint.findMany({
    where: { active: true, eventTypes: { has: eventType } },
    select: { id: true },
  });

  let created = 0;
  for (const endpoint of endpoints) {
    let delivery;
    try {
      delivery = await db.webhookDelivery.create({
        data: { endpointId: endpoint.id, eventId, eventType, payload: body },
      });
    } catch (err) {
      // (endpointId, eventId) is unique: this event was already recorded.
      if ((err as { code?: string }).code === "P2002") continue;
      throw err;
    }
    await getWebhookQueue().add(
      WEBHOOK_DELIVERY_JOB,
      { deliveryId: delivery.id },
      { jobId: delivery.id },
    );
    created += 1;
  }
  return created;
}

/**
 * Fire-and-forget entry point for market services. Never throws: a webhook
 * outage must not fail the market operation that produced the event.
 */
export async function dispatchWebhookEvent(
  eventType: WebhookEventType,
  data: Record<string, unknown>,
  dedupeKey?: string,
): Promise<void> {
  try {
    await enqueueWebhookEvent(eventType, data, dedupeKey);
  } catch (err) {
    logger.error({ err, eventType }, "failed to enqueue webhook event");
  }
}

// ─── Delivery ─────────────────────────────────────────────────────────────────

/**
 * Sends one POST to the already-validated, pinned address. Resolves with the
 * HTTP status code. The body is drained and discarded.
 */
export function postToTarget(
  target: PinnedTarget,
  body: string,
  headers: Record<string, string>,
): Promise<number> {
  const { url, address, family } = target;
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: "POST",
        protocol: "https:",
        hostname: bareHostname(url),
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: WEBHOOK_TIMEOUT_MS,
        // Connect to the address that passed validation, never a fresh lookup.
        lookup: ((_host: string, opts: { all?: boolean }, cb: (...args: unknown[]) => void) => {
          if (opts.all) cb(null, [{ address, family }]);
          else cb(null, address, family);
        }) as unknown as https.RequestOptions["lookup"],
      },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );
    req.on("timeout", () => req.destroy(new WebhookDeliveryError("request timed out")));
    req.on("error", (err) => reject(new WebhookDeliveryError(err.message)));
    req.end(body);
  });
}

async function markFailed(deliveryId: string, message: string, responseStatus?: number) {
  await db.webhookDelivery.update({
    where: { id: deliveryId },
    data: { status: "Failed", lastError: message, responseStatus: responseStatus ?? null },
  });
}

/**
 * Attempts one delivery. Throws `WebhookDeliveryError` for retryable failures
 * and `UnrecoverableError` for permanent ones (bad URL, missing row).
 */
export async function deliverWebhook(
  deliveryId: string,
  options: { isFinalAttempt: boolean },
): Promise<void> {
  const delivery = await db.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true },
  });
  if (!delivery) {
    throw new UnrecoverableError(`webhook delivery not found: ${deliveryId}`);
  }
  if (delivery.status === "Delivered") return;

  if (!delivery.endpoint.active) {
    await markFailed(deliveryId, "endpoint is disabled");
    webhookDeliveriesTotal.inc({ status: "failed" });
    return;
  }

  let target: PinnedTarget;
  try {
    target = await assertSafeWebhookUrl(delivery.endpoint.url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid webhook url";
    await markFailed(deliveryId, message);
    webhookDeliveriesTotal.inc({ status: "failed" });
    throw new UnrecoverableError(message);
  }

  const body = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(Date.now() / 1000);

  await db.webhookDelivery.update({
    where: { id: deliveryId },
    data: { attempts: { increment: 1 } },
  });

  let status: number;
  try {
    status = await postToTarget(target, body, {
      [WEBHOOK_SIGNATURE_HEADER]: buildSignatureHeader(delivery.endpoint.secret, timestamp, body),
      [WEBHOOK_EVENT_ID_HEADER]: delivery.eventId,
      [WEBHOOK_EVENT_TYPE_HEADER]: delivery.eventType,
      "User-Agent": "boxmeout-webhooks/1",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "delivery failed";
    await db.webhookDelivery.update({
      where: { id: deliveryId },
      data: { lastError: message },
    });
    if (options.isFinalAttempt) {
      await markFailed(deliveryId, message);
      webhookDeliveriesTotal.inc({ status: "failed" });
    }
    throw err instanceof WebhookDeliveryError ? err : new WebhookDeliveryError(message);
  }

  if (status >= 200 && status < 300) {
    await db.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: "Delivered", responseStatus: status, lastError: null, deliveredAt: new Date() },
    });
    webhookDeliveriesTotal.inc({ status: "delivered" });
    return;
  }

  // Non-2xx, including 3xx: redirects are never followed.
  const message = `endpoint responded with HTTP ${status}`;
  await db.webhookDelivery.update({
    where: { id: deliveryId },
    data: { responseStatus: status, lastError: message },
  });
  if (options.isFinalAttempt) {
    await markFailed(deliveryId, message, status);
    webhookDeliveriesTotal.inc({ status: "failed" });
  }
  throw new WebhookDeliveryError(message);
}

/** BullMQ processor. The final attempt is detected from the job's attempt budget. */
export async function processWebhookJob(job: Job<{ deliveryId: string }>): Promise<void> {
  const maxAttempts = job.opts.attempts ?? 1;
  const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;
  await deliverWebhook(job.data.deliveryId, { isFinalAttempt });
}

// ─── Worker lifecycle ─────────────────────────────────────────────────────────

let worker: Worker | null = null;

export function startWebhookWorker(): void {
  if (worker) return;
  worker = new Worker(WEBHOOK_QUEUE, processWebhookJob, {
    connection: REDIS_CONNECTION,
    concurrency: 5,
  });
  worker.on("failed", (job, err) => {
    logger.warn({ err, deliveryId: job?.data?.deliveryId }, "webhook delivery attempt failed");
  });
}

export async function stopWebhookWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
}

// ─── Admin management ─────────────────────────────────────────────────────────

export function parseEventTypes(input: unknown): WebhookEventType[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new WebhookValidationError("eventTypes must be a non-empty array");
  }
  const unknown = input.filter((t) => !(WEBHOOK_EVENT_TYPES as readonly unknown[]).includes(t));
  if (unknown.length > 0) {
    throw new WebhookValidationError(`unknown event types: ${unknown.join(", ")}`);
  }
  return [...new Set(input as WebhookEventType[])];
}

const PUBLIC_ENDPOINT_FIELDS = {
  id: true,
  url: true,
  eventTypes: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Creates an endpoint. The secret is returned here only; it is not retrievable later. */
export async function createWebhookEndpoint(url: string, eventTypes: unknown) {
  const types = parseEventTypes(eventTypes);
  await assertSafeWebhookUrl(url);
  const secret = randomBytes(32).toString("hex");
  const endpoint = await db.webhookEndpoint.create({
    data: { url, secret, eventTypes: types },
    select: { ...PUBLIC_ENDPOINT_FIELDS },
  });
  return { ...endpoint, secret };
}

export async function listWebhookEndpoints() {
  return db.webhookEndpoint.findMany({
    select: PUBLIC_ENDPOINT_FIELDS,
    orderBy: { createdAt: "desc" },
  });
}

export async function updateWebhookEndpoint(
  id: string,
  changes: { active?: boolean; eventTypes?: unknown; url?: string },
) {
  const data: Prisma.WebhookEndpointUpdateInput = {};
  if (changes.active !== undefined) data.active = changes.active;
  if (changes.eventTypes !== undefined) data.eventTypes = parseEventTypes(changes.eventTypes);
  if (changes.url !== undefined) {
    await assertSafeWebhookUrl(changes.url);
    data.url = changes.url;
  }
  return db.webhookEndpoint.update({ where: { id }, data, select: PUBLIC_ENDPOINT_FIELDS });
}

export async function deleteWebhookEndpoint(id: string): Promise<void> {
  await db.webhookEndpoint.delete({ where: { id } });
}

export async function listWebhookDeliveries(endpointId: string, limit: number) {
  return db.webhookDelivery.findMany({
    where: { endpointId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      eventId: true,
      eventType: true,
      status: true,
      attempts: true,
      responseStatus: true,
      lastError: true,
      createdAt: true,
      deliveredAt: true,
    },
  });
}
