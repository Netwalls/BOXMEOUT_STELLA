/**
 * #1581: signed outbound webhooks.
 *
 * Covers the HMAC signature (and its verifier), each SSRF rule, IP pinning,
 * retry/final-failure behaviour, and idempotent enqueueing. BullMQ, the
 * database, HTTP and DNS are all mocked: no broker, database or network.
 */
import { createHmac } from "crypto";
import dns from "node:dns";
import { EventEmitter } from "events";
import { UnrecoverableError } from "bullmq";
import { db } from "../../db";
import {
  WEBHOOK_BACKOFF_MS,
  WEBHOOK_MAX_ATTEMPTS,
  WebhookDeliveryError,
  WebhookUrlError,
  WebhookValidationError,
  assertSafeWebhookUrl,
  buildSignatureHeader,
  createWebhookEndpoint,
  deliverWebhook,
  enqueueWebhookEvent,
  isBlockedAddress,
  processWebhookJob,
  resolvePublicTarget,
  signWebhookPayload,
  validateWebhookUrlSyntax,
  verifyWebhookSignature,
  WEBHOOK_SIGNATURE_HEADER,
} from "../webhook.service";

// ── Mocks ─────────────────────────────────────────────────────────────────────
// Factories only reference `mock*` variables inside arrow functions, which run
// after module initialisation, so the hoisted jest.mock calls stay safe.

const mockQueueAdd = jest.fn();
const mockQueueCtor = jest.fn();
const mockHttpsRequest = jest.fn();

jest.mock("bullmq", () => {
  const actual = jest.requireActual("bullmq");
  return {
    ...actual,
    Queue: jest.fn().mockImplementation((...args: unknown[]) => {
      mockQueueCtor(...args);
      return { add: (...a: unknown[]) => mockQueueAdd(...a), close: jest.fn() };
    }),
    Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
  };
});

jest.mock("node:https", () => ({
  __esModule: true,
  default: { request: (...args: unknown[]) => mockHttpsRequest(...args) },
}));

jest.mock("../../db", () => ({
  db: {
    webhookEndpoint: { findMany: jest.fn(), create: jest.fn() },
    webhookDelivery: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
  },
}));

jest.mock("../../logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockDb = db as unknown as {
  webhookEndpoint: { findMany: jest.Mock; create: jest.Mock };
  webhookDelivery: { findUnique: jest.Mock; update: jest.Mock; create: jest.Mock };
};

const SECRET = "test-signing-secret";
const PUBLIC_URL = "https://hooks.example.com/boxmeout";
const PUBLIC_IP = "93.184.216.34";
const BODY = JSON.stringify({ id: "evt-1", type: "market.resolved", data: { marketId: "m1" } });

/** Makes https.request respond with `status` once the body is written. */
function respondWith(status: number) {
  mockHttpsRequest.mockImplementation((_opts: unknown, onResponse: (res: unknown) => void) => {
    const req = new EventEmitter() as EventEmitter & { end: (b: string) => void; destroy: jest.Mock };
    req.destroy = jest.fn();
    req.end = () => onResponse({ statusCode: status, resume: jest.fn() });
    return req;
  });
}

/** Makes https.request fail at the socket level. */
function failWith(message: string) {
  mockHttpsRequest.mockImplementation(() => {
    const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: jest.Mock };
    req.destroy = jest.fn();
    req.end = () => req.emit("error", new Error(message));
    return req;
  });
}

function deliveryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "delivery-1",
    eventId: "market.resolved:m1",
    eventType: "market.resolved",
    status: "Pending",
    payload: JSON.parse(BODY),
    endpoint: { url: PUBLIC_URL, secret: SECRET, active: true },
    ...overrides,
  };
}

beforeEach(() => {
  mockDb.webhookDelivery.update.mockResolvedValue({});
  mockDb.webhookDelivery.findUnique.mockResolvedValue(deliveryRow());
  jest.spyOn(dns.promises, "lookup").mockResolvedValue([
    { address: PUBLIC_IP, family: 4 },
  ] as never);
});

// ── Signature ─────────────────────────────────────────────────────────────────

describe("signature (#1581)", () => {
  it("is HMAC-SHA256 over `timestamp.body`, hex encoded", () => {
    const ts = 1_700_000_000;
    const expected = createHmac("sha256", SECRET).update(`${ts}.${BODY}`).digest("hex");

    expect(signWebhookPayload(SECRET, ts, BODY)).toBe(expected);
    expect(buildSignatureHeader(SECRET, ts, BODY)).toBe(`t=${ts},v1=${expected}`);
  });

  it("verifies a fresh, untampered payload", () => {
    const ts = 1_700_000_000;
    const header = buildSignatureHeader(SECRET, ts, BODY);
    expect(verifyWebhookSignature(SECRET, header, BODY, ts + 10)).toBe(true);
  });

  it("rejects a tampered body, a wrong secret, a stale timestamp and malformed headers", () => {
    const ts = 1_700_000_000;
    const header = buildSignatureHeader(SECRET, ts, BODY);

    expect(verifyWebhookSignature(SECRET, header, BODY.replace("m1", "m2"), ts)).toBe(false);
    expect(verifyWebhookSignature("other-secret", header, BODY, ts)).toBe(false);
    expect(verifyWebhookSignature(SECRET, header, BODY, ts + 3600)).toBe(false);
    expect(verifyWebhookSignature(SECRET, "garbage", BODY, ts)).toBe(false);
    expect(verifyWebhookSignature(SECRET, "t=abc,v1=00", BODY, ts)).toBe(false);
  });
});

// ── SSRF: URL syntax ──────────────────────────────────────────────────────────

describe("SSRF: URL syntax (#1581)", () => {
  it.each([
    ["plain http", "http://hooks.example.com/x", "must use https"],
    ["ftp scheme", "ftp://hooks.example.com/x", "must use https"],
    ["embedded credentials", "https://user:pw@hooks.example.com/x", "must not contain credentials"],
    ["localhost", "https://localhost/x", "local hostname"],
    ["*.localhost", "https://api.localhost/x", "local hostname"],
    ["*.internal", "https://metadata.internal/x", "local hostname"],
    ["not a URL", "not a url", "not a valid URL"],
  ])("rejects %s", (_label, url, message) => {
    expect(() => validateWebhookUrlSyntax(url)).toThrow(WebhookUrlError);
    expect(() => validateWebhookUrlSyntax(url)).toThrow(message);
  });

  it("accepts a public https URL", () => {
    expect(validateWebhookUrlSyntax(PUBLIC_URL).hostname).toBe("hooks.example.com");
  });
});

// ── SSRF: address classification ──────────────────────────────────────────────

describe("SSRF: blocked address ranges (#1581)", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::",
    "::1",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "::ffff:10.0.0.1",
    "::ffff:127.0.0.1",
    "::ffff:a00:1",
    "::ffff:7f00:1",
    "not-an-ip",
  ])("blocks %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "allows public %s",
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );
});

// ── SSRF: DNS resolution ──────────────────────────────────────────────────────

describe("SSRF: resolution (#1581)", () => {
  it("refuses a hostname that resolves to a private address", async () => {
    (dns.promises.lookup as jest.Mock).mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    await expect(assertSafeWebhookUrl(PUBLIC_URL)).rejects.toThrow(
      "resolves to a private or reserved address",
    );
  });

  it("refuses when ANY returned address is private, even if the first is public", async () => {
    (dns.promises.lookup as jest.Mock).mockResolvedValue([
      { address: PUBLIC_IP, family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(assertSafeWebhookUrl(PUBLIC_URL)).rejects.toThrow(WebhookUrlError);
  });

  it("refuses a hostname that does not resolve", async () => {
    (dns.promises.lookup as jest.Mock).mockRejectedValue(new Error("ENOTFOUND"));
    await expect(assertSafeWebhookUrl(PUBLIC_URL)).rejects.toThrow("did not resolve");
  });

  it("refuses an IPv6 literal that is loopback, without a DNS round trip for the policy", async () => {
    await expect(assertSafeWebhookUrl("https://[::1]/hook")).rejects.toThrow(WebhookUrlError);
  });

  it("returns the validated address so the connection can be pinned to it", async () => {
    await expect(resolvePublicTarget(new URL(PUBLIC_URL))).resolves.toEqual({
      url: new URL(PUBLIC_URL),
      address: PUBLIC_IP,
      family: 4,
    });
  });

  it("refuses the URL at endpoint creation, before writing anything", async () => {
    await expect(
      createWebhookEndpoint("https://10.0.0.7/hook", ["market.created"]),
    ).rejects.toThrow(WebhookUrlError);
    expect(mockDb.webhookEndpoint.create).not.toHaveBeenCalled();
  });

  it("rejects unknown event types with a validation error", async () => {
    await expect(createWebhookEndpoint(PUBLIC_URL, ["market.deleted"])).rejects.toThrow(
      WebhookValidationError,
    );
    await expect(createWebhookEndpoint(PUBLIC_URL, [])).rejects.toThrow(WebhookValidationError);
  });
});

// ── Delivery: request shape, pinning, responses ───────────────────────────────

describe("delivery (#1581)", () => {
  it("posts a signed request pinned to the validated address and marks it Delivered on 2xx", async () => {
    respondWith(204);

    await deliverWebhook("delivery-1", { isFinalAttempt: false });

    const [opts] = mockHttpsRequest.mock.calls[0];
    expect(opts.hostname).toBe("hooks.example.com");
    expect(opts.method).toBe("POST");

    // The connection is pinned: the lookup hook returns the validated IP, not a fresh resolution.
    const lookupCb = jest.fn();
    opts.lookup("hooks.example.com", {}, lookupCb);
    expect(lookupCb).toHaveBeenCalledWith(null, PUBLIC_IP, 4);

    // The signature header verifies against the body that was written.
    const header = opts.headers[WEBHOOK_SIGNATURE_HEADER];
    expect(verifyWebhookSignature(SECRET, header, BODY)).toBe(true);
    expect(opts.headers["X-Boxmeout-Event-Id"]).toBe("market.resolved:m1");

    expect(mockDb.webhookDelivery.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "Delivered", responseStatus: 204 }),
      }),
    );
  });

  it("retries a 5xx by throwing a retryable error, without marking the delivery Failed yet", async () => {
    respondWith(500);

    await expect(deliverWebhook("delivery-1", { isFinalAttempt: false })).rejects.toThrow(
      WebhookDeliveryError,
    );

    const statuses = mockDb.webhookDelivery.update.mock.calls.map((c) => c[0].data.status);
    expect(statuses).not.toContain("Failed");
    expect(mockDb.webhookDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ responseStatus: 500 }) }),
    );
  });

  it("marks the delivery Failed on the final attempt", async () => {
    respondWith(503);

    await expect(deliverWebhook("delivery-1", { isFinalAttempt: true })).rejects.toThrow(
      WebhookDeliveryError,
    );

    expect(mockDb.webhookDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "Failed", responseStatus: 503 }),
      }),
    );
  });

  it("treats a redirect as a failure and does not follow it", async () => {
    respondWith(302);
    await expect(deliverWebhook("delivery-1", { isFinalAttempt: false })).rejects.toThrow(
      "HTTP 302",
    );
    expect(mockHttpsRequest).toHaveBeenCalledTimes(1);
  });

  it("retries network errors and timeouts", async () => {
    failWith("socket hang up");
    await expect(deliverWebhook("delivery-1", { isFinalAttempt: false })).rejects.toThrow(
      WebhookDeliveryError,
    );
  });

  it("never sends to a private address discovered at delivery time (DNS rebinding)", async () => {
    (dns.promises.lookup as jest.Mock).mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);

    await expect(deliverWebhook("delivery-1", { isFinalAttempt: false })).rejects.toThrow(
      UnrecoverableError,
    );
    expect(mockHttpsRequest).not.toHaveBeenCalled();
    expect(mockDb.webhookDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "Failed" }) }),
    );
  });

  it("skips disabled endpoints without sending", async () => {
    mockDb.webhookDelivery.findUnique.mockResolvedValue(
      deliveryRow({ endpoint: { url: PUBLIC_URL, secret: SECRET, active: false } }),
    );
    await deliverWebhook("delivery-1", { isFinalAttempt: false });
    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });

  it("does not resend a delivery that is already Delivered", async () => {
    mockDb.webhookDelivery.findUnique.mockResolvedValue(deliveryRow({ status: "Delivered" }));
    await deliverWebhook("delivery-1", { isFinalAttempt: false });
    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });
});

// ── Retry policy through BullMQ ───────────────────────────────────────────────

describe("retry policy (#1581)", () => {
  it("re-throws on non-final attempts so BullMQ schedules a retry", async () => {
    respondWith(500);
    const job = { data: { deliveryId: "delivery-1" }, attemptsMade: 0, opts: { attempts: WEBHOOK_MAX_ATTEMPTS } };
    await expect(processWebhookJob(job as never)).rejects.toThrow(WebhookDeliveryError);
    expect(mockDb.webhookDelivery.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "Failed" }) }),
    );
  });

  it("marks Failed on the last attempt", async () => {
    respondWith(500);
    const job = {
      data: { deliveryId: "delivery-1" },
      attemptsMade: WEBHOOK_MAX_ATTEMPTS - 1,
      opts: { attempts: WEBHOOK_MAX_ATTEMPTS },
    };
    await expect(processWebhookJob(job as never)).rejects.toThrow(WebhookDeliveryError);
    expect(mockDb.webhookDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "Failed" }) }),
    );
  });

  it("queues with 6 attempts and exponential backoff from a 5s base", async () => {
    mockDb.webhookEndpoint.findMany.mockResolvedValue([{ id: "ep-1" }]);
    mockDb.webhookDelivery.create.mockResolvedValue({ id: "delivery-1" });
    mockQueueAdd.mockResolvedValue({});

    await enqueueWebhookEvent("market.created", { marketId: "m1" }, "market.created:m1");

    const defaults = mockQueueCtor.mock.calls[0][1].defaultJobOptions;
    expect(defaults.attempts).toBe(6);
    expect(defaults.backoff).toEqual({ type: "exponential", delay: WEBHOOK_BACKOFF_MS });
    expect(WEBHOOK_BACKOFF_MS).toBe(5_000);
  });
});

// ── Enqueue ───────────────────────────────────────────────────────────────────

describe("enqueue (#1581)", () => {
  it("writes one delivery per subscribed active endpoint and uses the delivery id as the job id", async () => {
    mockDb.webhookEndpoint.findMany.mockResolvedValue([{ id: "ep-1" }, { id: "ep-2" }]);
    mockDb.webhookDelivery.create
      .mockResolvedValueOnce({ id: "d-1" })
      .mockResolvedValueOnce({ id: "d-2" });
    mockQueueAdd.mockResolvedValue({});

    const count = await enqueueWebhookEvent("market.resolved", { marketId: "m1" }, "market.resolved:m1");

    expect(count).toBe(2);
    expect(mockDb.webhookEndpoint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true, eventTypes: { has: "market.resolved" } } }),
    );
    expect(mockDb.webhookDelivery.create.mock.calls[0][0].data.eventId).toBe("market.resolved:m1");
    expect(mockQueueAdd).toHaveBeenCalledWith(expect.any(String), { deliveryId: "d-1" }, { jobId: "d-1" });
    expect(mockQueueAdd).toHaveBeenCalledWith(expect.any(String), { deliveryId: "d-2" }, { jobId: "d-2" });
  });

  it("is idempotent: a duplicate event id is skipped and not queued twice", async () => {
    mockDb.webhookEndpoint.findMany.mockResolvedValue([{ id: "ep-1" }]);
    mockDb.webhookDelivery.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));

    const count = await enqueueWebhookEvent("market.created", { marketId: "m1" }, "market.created:m1");

    expect(count).toBe(0);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });
});
