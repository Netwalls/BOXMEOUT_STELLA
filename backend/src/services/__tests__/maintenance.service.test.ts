/**
 * B-160: maintenance flag state, toggling and audit entry.
 * Redis, Prisma and config are mocked.
 */
const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn();
jest.mock("../../lib/redis", () => ({
  redis: {
    get: (...args: unknown[]) => mockRedisGet(...args),
    set: (...args: unknown[]) => mockRedisSet(...args),
    del: (...args: unknown[]) => mockRedisDel(...args),
  },
}));

const mockAuditCreate = jest.fn();
jest.mock("../../db", () => ({
  db: { auditLog: { create: (...args: unknown[]) => mockAuditCreate(...args) } },
}));

jest.mock("../../config", () => ({ config: { MAINTENANCE_MODE: false } }));
jest.mock("../../logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { config } from "../../config";
import {
  MAINTENANCE_KEY,
  getMaintenanceState,
  setMaintenanceMode,
} from "../maintenance.service";
import { TimeoutError } from "../../lib/timeout";

const mutableConfig = config as { MAINTENANCE_MODE: boolean };

beforeEach(() => {
  mutableConfig.MAINTENANCE_MODE = false;
  mockRedisGet.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue("OK");
  mockRedisDel.mockResolvedValue(1);
  mockAuditCreate.mockResolvedValue({ id: "a1" });
});

describe("getMaintenanceState", () => {
  it("is off when no flag is stored and no env override is set", async () => {
    await expect(getMaintenanceState()).resolves.toEqual({
      enabled: false,
      source: null,
      reason: null,
      since: null,
      actor: null,
    });
  });

  it("is on when the Redis flag is set, with its reason and actor", async () => {
    mockRedisGet.mockResolvedValue(
      JSON.stringify({ reason: "reindex", since: "2026-11-19T10:00:00.000Z", actor: "admin" }),
    );

    await expect(getMaintenanceState()).resolves.toEqual({
      enabled: true,
      source: "admin",
      reason: "reindex",
      since: "2026-11-19T10:00:00.000Z",
      actor: "admin",
    });
  });

  it("is on from the env override even when Redis has no flag", async () => {
    mutableConfig.MAINTENANCE_MODE = true;

    const state = await getMaintenanceState();
    expect(state.enabled).toBe(true);
    expect(state.source).toBe("env");
  });

  it("treats an unreadable stored flag as enabled so it fails safe", async () => {
    mockRedisGet.mockResolvedValue("{not json");

    const state = await getMaintenanceState();
    expect(state.enabled).toBe(true);
    expect(state.source).toBe("admin");
  });

  it("rejects instead of hanging when Redis does not answer", async () => {
    mockRedisGet.mockReturnValue(new Promise(() => {}));

    await expect(getMaintenanceState()).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe("setMaintenanceMode", () => {
  it("turning it on stores the flag and writes an audit entry", async () => {
    // First read: no previous flag. Second read (after the write): the new flag.
    const stored = JSON.stringify({ reason: "database migration", since: "t", actor: "admin" });
    mockRedisGet.mockResolvedValueOnce(null).mockResolvedValueOnce(stored);

    const state = await setMaintenanceMode({
      enabled: true,
      actor: "admin",
      reason: "database migration",
      ipAddress: "10.0.0.5",
    });

    expect(mockRedisSet).toHaveBeenCalledWith(
      MAINTENANCE_KEY,
      expect.stringContaining('"reason":"database migration"'),
    );
    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: {
        userId: "admin",
        ipAddress: "10.0.0.5",
        method: "POST",
        path: "/api/admin/maintenance",
        requestBody: {
          action: "MAINTENANCE_ENABLED",
          enabled: true,
          reason: "database migration",
        },
        statusCode: 200,
      },
    });
    expect(state).toEqual({
      enabled: true,
      source: "admin",
      reason: "database migration",
      since: "t",
      actor: "admin",
    });
  });

  it("turning it off deletes the flag and writes a MAINTENANCE_DISABLED audit entry", async () => {
    // First read: the flag is on. Second read (after the delete): it is gone.
    mockRedisGet
      .mockResolvedValueOnce(JSON.stringify({ reason: null, since: "x", actor: "admin" }))
      .mockResolvedValueOnce(null);

    const state = await setMaintenanceMode({ enabled: false, actor: "admin", ipAddress: "10.0.0.5" });

    expect(mockRedisDel).toHaveBeenCalledWith(MAINTENANCE_KEY);
    expect(mockAuditCreate.mock.calls[0][0].data.requestBody).toEqual({
      action: "MAINTENANCE_DISABLED",
      enabled: false,
      reason: null,
    });
    expect(state.enabled).toBe(false);
  });

  it("restores the previous flag when the audit write fails", async () => {
    const previous = JSON.stringify({ reason: "old", since: "x", actor: "admin" });
    mockRedisGet.mockResolvedValue(previous);
    mockAuditCreate.mockRejectedValue(new Error("db down"));

    await expect(
      setMaintenanceMode({ enabled: false, actor: "admin", ipAddress: "10.0.0.5" }),
    ).rejects.toThrow("db down");

    expect(mockRedisDel).toHaveBeenCalledWith(MAINTENANCE_KEY);
    expect(mockRedisSet).toHaveBeenCalledWith(MAINTENANCE_KEY, previous);
  });

  it("clears the flag again when the audit write fails and nothing was set before", async () => {
    mockAuditCreate.mockRejectedValue(new Error("db down"));

    await expect(
      setMaintenanceMode({ enabled: true, actor: "admin", ipAddress: "10.0.0.5" }),
    ).rejects.toThrow("db down");

    expect(mockRedisDel).toHaveBeenLastCalledWith(MAINTENANCE_KEY);
  });
});
