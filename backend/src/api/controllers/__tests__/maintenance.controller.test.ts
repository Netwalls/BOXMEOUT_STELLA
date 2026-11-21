/**
 * B-160: admin GET/POST for maintenance mode.
 */
const mockSet = jest.fn();
const mockGet = jest.fn();
jest.mock("../../../services/maintenance.service", () => ({
  ADMIN_AUDIT_ACTOR: "admin",
  getMaintenanceState: (...args: unknown[]) => mockGet(...args),
  setMaintenanceMode: (...args: unknown[]) => mockSet(...args),
}));
jest.mock("../../../logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import express from "express";
import request from "supertest";
import { getMaintenanceHandler, setMaintenanceHandler } from "../maintenance.controller";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.get("/api/admin/maintenance", getMaintenanceHandler);
  app.post("/api/admin/maintenance", setMaintenanceHandler);
  return app;
}

beforeEach(() => {
  mockSet.mockImplementation(async (input: { enabled: boolean }) => ({
    enabled: input.enabled,
    source: input.enabled ? "admin" : null,
    reason: null,
    since: null,
    actor: "admin",
  }));
  mockGet.mockResolvedValue({ enabled: false, source: null, reason: null, since: null, actor: null });
});

describe("POST /api/admin/maintenance", () => {
  it("turns maintenance on with the reason and the admin actor", async () => {
    const res = await request(buildApp())
      .post("/api/admin/maintenance")
      .send({ enabled: true, reason: "  reindex  " });

    expect(res.status).toBe(200);
    expect(res.body.data.enabled).toBe(true);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, reason: "reindex", actor: "admin" }),
    );
  });

  it("turns maintenance off", async () => {
    const res = await request(buildApp()).post("/api/admin/maintenance").send({ enabled: false });

    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ enabled: false, reason: null }));
  });

  it.each([
    ["missing enabled", {}],
    ["string enabled", { enabled: "true" }],
    ["unknown key", { enabled: true, actor: "someone" }],
    ["reason too long", { enabled: true, reason: "x".repeat(201) }],
  ])("returns 400 VALIDATION_ERROR for %s and changes nothing", async (_label, body) => {
    const res = await request(buildApp()).post("/api/admin/maintenance").send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("returns 500 without leaking the error when the write fails", async () => {
    mockSet.mockRejectedValue(new Error("connection string leaked"));

    const res = await request(buildApp()).post("/api/admin/maintenance").send({ enabled: true });

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("connection string");
  });
});

describe("GET /api/admin/maintenance", () => {
  it("returns the current state", async () => {
    mockGet.mockResolvedValue({ enabled: true, source: "admin", reason: "x", since: "t", actor: "admin" });

    const res = await request(buildApp()).get("/api/admin/maintenance");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ enabled: true, source: "admin", reason: "x", since: "t", actor: "admin" });
  });
});
