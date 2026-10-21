/**
 * B-60: /ready endpoint tests
 *
 * Verifies:
 *   1. Returns 200 { status: "ok" } when all dependencies are healthy
 *   2. Returns 503 { status: "not_ready" } when DB fails
 *   3. Returns 503 when Redis fails
 *   4. Returns 503 when RPC fails
 *   5. Returns per-dependency status in all cases
 *   6. Each failing check is isolated — others still report correctly
 */

import { readinessHandler } from "../readiness.controller";
import type { Request, Response } from "express";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock db
const mockQueryRaw = jest.fn();
const mockIndexerStateFindUnique = jest.fn();
jest.mock("../../../db", () => ({
  db: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    indexerState: {
      findUnique: (...args: unknown[]) => mockIndexerStateFindUnique(...args),
    },
  },
}));

// Mock ioredis
const mockPing = jest.fn();
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();

jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    ping: mockPing,
    disconnect: mockDisconnect,
  }));
});

// Mock SorobanRpc
const mockGetHealth = jest.fn();
const mockGetLatestLedger = jest.fn();
jest.mock("@stellar/stellar-sdk", () => ({
  SorobanRpc: {
    Server: jest.fn().mockImplementation(() => ({
      getHealth: mockGetHealth,
      getLatestLedger: mockGetLatestLedger,
    })),
  },
}));

// ── Response helper ───────────────────────────────────────────────────────────

function makeRes(): { res: Response; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("B-60: GET /ready", () => {
  const req = {} as Request;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STELLAR_RPC_URL = "https://soroban-testnet.stellar.org";
    process.env.REDIS_URL = "redis://localhost:6379";
    delete process.env.INDEXER_MAX_LEDGER_LAG;
    // Indexer is in sync by default; lag tests override these.
    mockIndexerStateFindUnique.mockResolvedValue({ id: 1, lastLedger: 1000 });
    mockGetLatestLedger.mockResolvedValue({ sequence: 1010 });
  });

  it("returns 200 with status ok when all dependencies are healthy", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockConnect.mockResolvedValue(undefined);
    mockPing.mockResolvedValue("PONG");
    mockGetHealth.mockResolvedValue({ status: "healthy" });

    const { res, status, json } = makeRes();
    await readinessHandler(req, res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ok",
        checks: expect.objectContaining({
          db: { status: "ok" },
          redis: { status: "ok" },
          rpc: { status: "ok" },
        }),
      })
    );
  });

  it("returns 503 with db error when DB is unavailable", async () => {
    mockQueryRaw.mockRejectedValue(new Error("connection refused"));
    mockConnect.mockResolvedValue(undefined);
    mockPing.mockResolvedValue("PONG");
    mockGetHealth.mockResolvedValue({ status: "healthy" });

    const { res, status, json } = makeRes();
    await readinessHandler(req, res);

    expect(status).toHaveBeenCalledWith(503);
    const body = json.mock.calls[0][0];
    expect(body.status).toBe("not_ready");
    expect(body.checks.db.status).toBe("error");
    expect(body.checks.redis.status).toBe("ok");
    expect(body.checks.rpc.status).toBe("ok");
  });

  it("returns 503 with redis error when Redis is unavailable", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockConnect.mockRejectedValue(new Error("ECONNREFUSED"));
    mockPing.mockResolvedValue("PONG");
    mockGetHealth.mockResolvedValue({ status: "healthy" });

    const { res, status, json } = makeRes();
    await readinessHandler(req, res);

    expect(status).toHaveBeenCalledWith(503);
    const body = json.mock.calls[0][0];
    expect(body.status).toBe("not_ready");
    expect(body.checks.db.status).toBe("ok");
    expect(body.checks.redis.status).toBe("error");
    expect(body.checks.rpc.status).toBe("ok");
  });

  it("returns 503 with rpc error when Soroban RPC is unavailable", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockConnect.mockResolvedValue(undefined);
    mockPing.mockResolvedValue("PONG");
    mockGetHealth.mockRejectedValue(new Error("RPC timeout"));

    const { res, status, json } = makeRes();
    await readinessHandler(req, res);

    expect(status).toHaveBeenCalledWith(503);
    const body = json.mock.calls[0][0];
    expect(body.status).toBe("not_ready");
    expect(body.checks.db.status).toBe("ok");
    expect(body.checks.redis.status).toBe("ok");
    expect(body.checks.rpc.status).toBe("error");
  });

  it("returns 503 when all dependencies fail", async () => {
    mockQueryRaw.mockRejectedValue(new Error("db down"));
    mockConnect.mockRejectedValue(new Error("redis down"));
    mockGetHealth.mockRejectedValue(new Error("rpc down"));

    const { res, status, json } = makeRes();
    await readinessHandler(req, res);

    expect(status).toHaveBeenCalledWith(503);
    const body = json.mock.calls[0][0];
    expect(body.status).toBe("not_ready");
    expect(body.checks.db.status).toBe("error");
    expect(body.checks.redis.status).toBe("error");
    expect(body.checks.rpc.status).toBe("error");
  });

  it("includes per-dependency status objects in the response body", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockConnect.mockResolvedValue(undefined);
    mockPing.mockResolvedValue("PONG");
    mockGetHealth.mockResolvedValue({ status: "healthy" });

    const { res, json } = makeRes();
    await readinessHandler(req, res);

    const body = json.mock.calls[0][0];
    expect(body.checks).toHaveProperty("db");
    expect(body.checks).toHaveProperty("redis");
    expect(body.checks).toHaveProperty("rpc");
  });
});

describe("B-112 / #1410: indexer lag in GET /ready", () => {
  const req = {} as Request;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STELLAR_RPC_URL = "https://soroban-testnet.stellar.org";
    process.env.REDIS_URL = "redis://localhost:6379";
    delete process.env.INDEXER_MAX_LEDGER_LAG;
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockConnect.mockResolvedValue(undefined);
    mockPing.mockResolvedValue("PONG");
    mockGetHealth.mockResolvedValue({ status: "healthy" });
  });

  it("reports the indexer as ok when lag is within the default threshold", async () => {
    mockIndexerStateFindUnique.mockResolvedValue({ id: 1, lastLedger: 1000 });
    mockGetLatestLedger.mockResolvedValue({ sequence: 1100 });

    const { res, status, json } = makeRes();
    await readinessHandler(req, res);

    expect(status).toHaveBeenCalledWith(200);
    const body = json.mock.calls[0][0];
    expect(body.checks.indexer).toEqual({ status: "ok", lagLedgers: 100 });
  });

  it("returns 503 when lag exceeds the default threshold of 120 ledgers", async () => {
    mockIndexerStateFindUnique.mockResolvedValue({ id: 1, lastLedger: 1000 });
    mockGetLatestLedger.mockResolvedValue({ sequence: 1121 });

    const { res, status, json } = makeRes();
    await readinessHandler(req, res);

    expect(status).toHaveBeenCalledWith(503);
    const body = json.mock.calls[0][0];
    expect(body.status).toBe("not_ready");
    expect(body.checks.indexer.status).toBe("error");
    expect(body.checks.indexer.lagLedgers).toBe(121);
    expect(body.checks.indexer.error).toBe("indexer lag 121 ledgers exceeds 120");
  });

  it("honours a configured INDEXER_MAX_LEDGER_LAG threshold", async () => {
    process.env.INDEXER_MAX_LEDGER_LAG = "1000";
    mockIndexerStateFindUnique.mockResolvedValue({ id: 1, lastLedger: 1000 });
    mockGetLatestLedger.mockResolvedValue({ sequence: 1500 });

    const { res, status } = makeRes();
    await readinessHandler(req, res);

    expect(status).toHaveBeenCalledWith(200);
  });

  it("treats a missing indexer state row as lag from ledger zero", async () => {
    mockIndexerStateFindUnique.mockResolvedValue(null);
    mockGetLatestLedger.mockResolvedValue({ sequence: 5000 });

    const { res, status, json } = makeRes();
    await readinessHandler(req, res);

    expect(status).toHaveBeenCalledWith(503);
    expect(json.mock.calls[0][0].checks.indexer.lagLedgers).toBe(5000);
  });

  it("returns 503 with an indexer error when the lag lookup fails", async () => {
    mockGetLatestLedger.mockRejectedValue(new Error("RPC timeout"));

    const { res, status, json } = makeRes();
    await readinessHandler(req, res);

    expect(status).toHaveBeenCalledWith(503);
    expect(json.mock.calls[0][0].checks.indexer.status).toBe("error");
  });
});
