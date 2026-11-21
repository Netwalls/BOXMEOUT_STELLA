/**
 * B-137: cancelMarketHandler (POST /api/admin/markets/cancel)
 *
 * Unit-level: the handler is called with a fake req/res. DB and the BullMQ
 * enqueue are mocked, so no Postgres, Redis or Stellar access is needed.
 * Covers status gating (Open/Locked allowed, others 409), the duplicate
 * request path, the RPC/queue failure path and body validation.
 */
import type { NextFunction, Request, Response } from "express";
import { cancelMarketHandler } from "../src/api/controllers/marketCancellation.controller";

const mockFindUnique = jest.fn();
const mockEnqueue = jest.fn();

jest.mock("../src/db", () => ({
  db: { market: { findUnique: (...args: unknown[]) => mockFindUnique(...args) } },
}));

jest.mock("../src/services/oracle.service", () => ({
  CANCELLABLE_MARKET_STATUSES: ["Open", "Locked"],
  enqueueCancellation: (...args: unknown[]) => mockEnqueue(...args),
}));

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

async function call(body: unknown) {
  const res = fakeRes();
  const next = jest.fn() as unknown as NextFunction;
  await cancelMarketHandler({ body } as Request, res as unknown as Response, next);
  return { res, next };
}

const valid = { marketId: "m-1", reason: "fight postponed" };

describe("B-137 — cancelMarketHandler", () => {
  test.each(["Open", "Locked"])("queues cancellation for a %s market (202)", async (status) => {
    mockFindUnique.mockResolvedValue({ id: "m-1", status });
    mockEnqueue.mockResolvedValue(undefined);

    const { res } = await call(valid);

    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual({ data: { success: true, marketId: "m-1", status: "queued" } });
    expect(mockEnqueue).toHaveBeenCalledWith("m-1", "fight postponed");
  });

  test.each(["Resolved", "Cancelled", "Disputed", "Finalized"])(
    "rejects a %s market with 409 and does not enqueue",
    async (status) => {
      mockFindUnique.mockResolvedValue({ id: "m-1", status });

      const { res } = await call(valid);

      expect(res.statusCode).toBe(409);
      expect(res.body).toMatchObject({ error: { code: "INVALID_STATE" } });
      expect(mockEnqueue).not.toHaveBeenCalled();
    },
  );

  test("returns 404 for an unknown market", async () => {
    mockFindUnique.mockResolvedValue(null);

    const { res } = await call(valid);

    expect(res.statusCode).toBe(404);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  test("a duplicate request is accepted again; the enqueue layer owns the idempotency", async () => {
    mockFindUnique.mockResolvedValue({ id: "m-1", status: "Open" });
    mockEnqueue.mockResolvedValue(undefined);

    const first = await call(valid);
    const second = await call(valid);

    expect(first.res.statusCode).toBe(202);
    expect(second.res.statusCode).toBe(202);
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
  });

  test("a queue or RPC failure is passed to next() for the error handler", async () => {
    mockFindUnique.mockResolvedValue({ id: "m-1", status: "Open" });
    const failure = new Error("redis unavailable");
    mockEnqueue.mockRejectedValue(failure);

    const { res, next } = await call(valid);

    expect(next).toHaveBeenCalledWith(failure);
    expect(res.body).toBeUndefined();
  });

  test.each([
    ["missing marketId", { reason: "x" }],
    ["blank marketId", { marketId: "  ", reason: "x" }],
    ["missing reason", { marketId: "m-1" }],
    ["blank reason", { marketId: "m-1", reason: "   " }],
    ["no body", undefined],
  ])("validates the body (%s) → 400 and never touches the DB", async (_label, payload) => {
    const { res } = await call(payload);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
