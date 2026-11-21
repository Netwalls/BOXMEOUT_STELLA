/**
 * B-157: unit tests for the shared Soroban RPC client.
 * The SDK is mocked, so no network access is needed.
 */
const serverCtor = jest.fn();

jest.mock("../../logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock("@stellar/stellar-sdk", () => ({
  SorobanRpc: { Server: function (...args: unknown[]) { return serverCtor(...args); } },
}));

import {
  backoffDelayMs,
  getRpcServer,
  isTransientRpcError,
  resetRpcServerForTests,
  withRpcRetry,
} from "../soroban";
import { TimeoutError } from "../timeout";

const ORIGINAL_ENV = { ...process.env };

function transientError(): Error & { code: string } {
  return Object.assign(new Error("socket reset"), { code: "ECONNRESET" });
}

function permanentError(): Error {
  return new Error("contract rejected the call");
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, STELLAR_RPC_URL: "https://rpc.example.test", NODE_ENV: "test" };
  delete process.env.RPC_TIMEOUT_MS;
  resetRpcServerForTests();
  serverCtor.mockReset();
  serverCtor.mockImplementation(() => ({ kind: "server" }));
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("getRpcServer", () => {
  it("returns the same instance on every call", () => {
    const first = getRpcServer();
    const second = getRpcServer();

    expect(first).toBe(second);
    expect(serverCtor).toHaveBeenCalledTimes(1);
  });

  it("allows HTTP outside production", () => {
    process.env.NODE_ENV = "development";
    getRpcServer();

    expect(serverCtor).toHaveBeenCalledWith(
      "https://rpc.example.test",
      expect.objectContaining({ allowHttp: true }),
    );
  });

  it("disallows HTTP in production", () => {
    process.env.NODE_ENV = "production";
    getRpcServer();

    expect(serverCtor).toHaveBeenCalledWith(
      "https://rpc.example.test",
      expect.objectContaining({ allowHttp: false }),
    );
  });

  it("applies RPC_TIMEOUT_MS as the request timeout", () => {
    process.env.RPC_TIMEOUT_MS = "4321";
    getRpcServer();

    expect(serverCtor).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeout: 4321 }),
    );
  });

  it("falls back to 15 s when RPC_TIMEOUT_MS is invalid", () => {
    process.env.RPC_TIMEOUT_MS = "not-a-number";
    getRpcServer();

    expect(serverCtor).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeout: 15_000 }),
    );
  });

  it("throws when STELLAR_RPC_URL is missing", () => {
    delete process.env.STELLAR_RPC_URL;

    expect(() => getRpcServer()).toThrow("STELLAR_RPC_URL environment variable is not set");
    expect(serverCtor).not.toHaveBeenCalled();
  });
});

describe("isTransientRpcError", () => {
  it.each([
    ["timeout", new TimeoutError("rpc", 10)],
    ["ECONNRESET", transientError()],
    ["HTTP 503 on status", Object.assign(new Error("unavailable"), { status: 503 })],
    ["HTTP 429 on response", Object.assign(new Error("slow down"), { response: { status: 429 } })],
  ])("treats %s as transient", (_label, err) => {
    expect(isTransientRpcError(err)).toBe(true);
  });

  it.each([
    ["plain error", permanentError()],
    ["HTTP 400", Object.assign(new Error("bad request"), { status: 400 })],
    ["non-object", "boom"],
    ["null", null],
  ])("treats %s as permanent", (_label, err) => {
    expect(isTransientRpcError(err)).toBe(false);
  });
});

describe("backoffDelayMs", () => {
  afterEach(() => jest.restoreAllMocks());

  it("stays within the exponential ceiling and the max cap", () => {
    jest.spyOn(Math, "random").mockReturnValue(0.999);

    expect(backoffDelayMs(0, 100, 10_000)).toBe(99); // 100 * 2^0
    expect(backoffDelayMs(2, 100, 10_000)).toBe(399); // 100 * 2^2
    expect(backoffDelayMs(20, 100, 1_000)).toBe(999); // capped at max
  });

  it("returns 0 when jitter draws the lowest value", () => {
    jest.spyOn(Math, "random").mockReturnValue(0);
    expect(backoffDelayMs(3, 250, 2_000)).toBe(0);
  });
});

describe("withRpcRetry", () => {
  const fast = { baseDelayMs: 0, maxDelayMs: 0 };

  it("returns the value of a successful first attempt without retrying", async () => {
    const fn = jest.fn().mockResolvedValue("ledger-42");

    await expect(
      withRpcRetry(fn, { method: "getLatestLedger", idempotent: true, ...fast }),
    ).resolves.toBe("ledger-42");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure of an idempotent read and then succeeds", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(transientError())
      .mockRejectedValueOnce(transientError())
      .mockResolvedValue("ok");

    await expect(
      withRpcRetry(fn, { method: "getAccount", idempotent: true, retries: 2, ...fast }),
    ).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("gives up after the configured number of retries", async () => {
    const fn = jest.fn().mockRejectedValue(transientError());

    await expect(
      withRpcRetry(fn, { method: "getAccount", idempotent: true, retries: 2, ...fast }),
    ).rejects.toThrow("socket reset");
    expect(fn).toHaveBeenCalledTimes(3); // first attempt + 2 retries
  });

  it("does not retry a permanent error even for an idempotent read", async () => {
    const fn = jest.fn().mockRejectedValue(permanentError());

    await expect(
      withRpcRetry(fn, { method: "simulateTransaction", idempotent: true, ...fast }),
    ).rejects.toThrow("contract rejected the call");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("never retries a non-idempotent submission without a guard", async () => {
    const fn = jest.fn().mockRejectedValue(transientError());

    await expect(withRpcRetry(fn, { method: "sendTransaction", ...fast })).rejects.toThrow(
      "socket reset",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a non-idempotent submission only when the guard allows it", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(transientError())
      .mockResolvedValue("submitted");
    const canRetry = jest.fn().mockResolvedValue(true);

    await expect(
      withRpcRetry(fn, { method: "sendTransaction", canRetry, retries: 2, ...fast }),
    ).resolves.toBe("submitted");
    expect(canRetry).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-idempotent submission when the guard refuses", async () => {
    const fn = jest.fn().mockRejectedValue(transientError());
    const canRetry = jest.fn().mockResolvedValue(false);

    await expect(
      withRpcRetry(fn, { method: "sendTransaction", canRetry, ...fast }),
    ).rejects.toThrow("socket reset");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("bounds a hung call with RPC_TIMEOUT_MS and reports a TimeoutError", async () => {
    process.env.RPC_TIMEOUT_MS = "20";
    const fn = jest.fn(() => new Promise<never>(() => {}));

    await expect(
      withRpcRetry(fn, { method: "getEvents", idempotent: true, retries: 1, ...fast }),
    ).rejects.toBeInstanceOf(TimeoutError);
    expect(fn).toHaveBeenCalledTimes(2); // timeouts are transient, so one retry
  });
});
