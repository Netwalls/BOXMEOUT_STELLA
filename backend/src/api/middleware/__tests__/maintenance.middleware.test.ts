/**
 * B-160: writes are blocked while maintenance is on, reads and probes are not.
 */
const mockGetState = jest.fn();
jest.mock("../../../services/maintenance.service", () => ({
  ADMIN_MAINTENANCE_PATH: "/api/admin/maintenance",
  MAINTENANCE_RETRY_AFTER_SECONDS: 60,
  getMaintenanceState: (...args: unknown[]) => mockGetState(...args),
}));
jest.mock("../../../config", () => ({ config: { MAINTENANCE_MODE: false } }));
jest.mock("../../../logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import express from "express";
import request from "supertest";
import { config } from "../../../config";
import { maintenanceMiddleware, isMaintenanceExempt } from "../maintenance.middleware";

const mutableConfig = config as { MAINTENANCE_MODE: boolean };

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(maintenanceMiddleware());
  app.get("/api/markets", (_req, res) => res.json({ data: [] }));
  app.post("/api/bets", (_req, res) => res.status(201).json({ data: { ok: true } }));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.post("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/ready", (_req, res) => res.json({ status: "ok" }));
  app.get("/metrics", (_req, res) => res.type("text/plain").send("m 1"));
  app.get("/api/admin/maintenance", (_req, res) => res.json({ data: {} }));
  app.post("/api/admin/maintenance", (_req, res) => res.json({ data: { enabled: true } }));
  return app;
}

beforeEach(() => {
  mutableConfig.MAINTENANCE_MODE = false;
  mockGetState.mockResolvedValue({ enabled: false });
});

describe("maintenance on", () => {
  beforeEach(() => mockGetState.mockResolvedValue({ enabled: true }));

  it("returns 503 with Retry-After for a non-GET request", async () => {
    const res = await request(buildApp()).post("/api/bets").send({ amount: 1 });

    expect(res.status).toBe(503);
    expect(res.headers["retry-after"]).toBe("60");
    expect(res.body.error.code).toBe("MAINTENANCE_MODE");
  });

  it("keeps GET reads working", async () => {
    const res = await request(buildApp()).get("/api/markets");
    expect(res.status).toBe(200);
  });

  it("keeps /health, /ready and /metrics working", async () => {
    const app = buildApp();
    expect((await request(app).get("/health")).status).toBe(200);
    expect((await request(app).get("/ready")).status).toBe(200);
    expect((await request(app).get("/metrics")).status).toBe(200);
  });

  it("does not block /health for a POST either, since it is probe-only", async () => {
    const res = await request(buildApp()).post("/health");
    expect(res.status).toBe(200);
  });

  it("lets the admin toggle through so the flag can be turned off", async () => {
    const res = await request(buildApp()).post("/api/admin/maintenance").send({ enabled: false });
    expect(res.status).toBe(200);
  });
});

describe("maintenance off", () => {
  it("lets writes through", async () => {
    const res = await request(buildApp()).post("/api/bets").send({ amount: 1 });

    expect(res.status).toBe(201);
    expect(res.headers["retry-after"]).toBeUndefined();
  });
});

describe("state lookup failure", () => {
  it("falls back to the env override when the lookup throws", async () => {
    mockGetState.mockRejectedValue(new Error("redis unreachable"));
    mutableConfig.MAINTENANCE_MODE = true;

    const res = await request(buildApp()).post("/api/bets").send({});
    expect(res.status).toBe(503);
  });

  it("allows writes when the lookup throws and no env override is set", async () => {
    mockGetState.mockRejectedValue(new Error("redis unreachable"));

    const res = await request(buildApp()).post("/api/bets").send({});
    expect(res.status).toBe(201);
  });
});

describe("isMaintenanceExempt", () => {
  it.each([
    ["GET", "/api/anything"],
    ["HEAD", "/api/anything"],
    ["OPTIONS", "/api/anything"],
    ["POST", "/health"],
    ["POST", "/ready"],
    ["POST", "/metrics"],
    ["POST", "/api/admin/maintenance"],
  ])("exempts %s %s", (method, path) => {
    expect(isMaintenanceExempt(method, path)).toBe(true);
  });

  it.each([
    ["POST", "/api/bets"],
    ["PUT", "/api/users/GABC"],
    ["POST", "/api/admin/maintenance/extra"],
  ])("does not exempt %s %s", (method, path) => {
    expect(isMaintenanceExempt(method, path)).toBe(false);
  });
});
