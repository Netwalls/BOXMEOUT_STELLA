/**
 * B-160: /ready reports the maintenance state. All dependencies are mocked.
 */
const mockGetState = jest.fn();
jest.mock("../../../services/maintenance.service", () => ({
  getMaintenanceState: (...args: unknown[]) => mockGetState(...args),
}));

jest.mock("../../../db", () => ({
  db: {
    $queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }]),
    indexerState: { findUnique: jest.fn().mockResolvedValue({ id: 1, lastLedger: 100 }) },
  },
}));

jest.mock("../../../lib/soroban", () => ({
  getRpcServer: () => ({
    getHealth: jest.fn().mockResolvedValue({ status: "healthy" }),
    getLatestLedger: jest.fn().mockResolvedValue({ sequence: 100 }),
  }),
}));

jest.mock("ioredis", () =>
  jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue("PONG"),
    disconnect: jest.fn(),
  })),
);

import express from "express";
import request from "supertest";
import { readinessHandler } from "../readiness.controller";

function buildApp() {
  const app = express();
  app.get("/ready", readinessHandler);
  return app;
}

describe("GET /ready maintenance reporting", () => {
  it("reports maintenance as on and keeps the service ready", async () => {
    mockGetState.mockResolvedValue({ enabled: true, source: "admin", reason: "reindex", since: "t", actor: "admin" });

    const res = await request(buildApp()).get("/ready");

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ok");
    expect(res.body.data.maintenance.enabled).toBe(true);
    expect(res.body.data.maintenance.reason).toBe("reindex");
  });

  it("reports maintenance as off", async () => {
    mockGetState.mockResolvedValue({ enabled: false, source: null, reason: null, since: null, actor: null });

    const res = await request(buildApp()).get("/ready");

    expect(res.body.data.maintenance.enabled).toBe(false);
  });

  it("returns maintenance null when the state cannot be read, without failing readiness", async () => {
    mockGetState.mockRejectedValue(new Error("redis down"));

    const res = await request(buildApp()).get("/ready");

    expect(res.status).toBe(200);
    expect(res.body.data.maintenance).toBeNull();
  });
});
