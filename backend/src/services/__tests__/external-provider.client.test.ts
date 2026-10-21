/**
 * B-113 / #1411 — timeouts, bounded retries, circuit breaker and zod
 * validation for the external result provider client.
 *
 * The provider is a mocked fetch. Sleep and the clock are injected, so the
 * suite runs without real waiting.
 */

jest.mock("../../logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { z } from "zod";
import {
  createProviderClient,
  CircuitOpenError,
  ProviderResponseError,
  TransientProviderError,
} from "../external-provider.client";

const Schema = z.object({ id: z.string(), winner: z.string() });
const URL = "https://provider.test/fights";
const okResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const statusResponse = (status: number) => new Response("", { status });

/** A fetch that never answers unless the request is aborted. */
const hangingFetch = (signal?: AbortSignal | null) =>
  new Promise<Response>((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(new Error("aborted")));
  });

function makeClient(overrides: Partial<Parameters<typeof createProviderClient>[0]> = {}) {
  let clock = 0;
  const sleep = jest.fn().mockResolvedValue(undefined);
  const fetchImpl = jest.fn();
  const client = createProviderClient({
    name: "test-provider",
    timeoutMs: 50,
    maxRetries: 2,
    baseDelayMs: 100,
    maxDelayMs: 1_000,
    failureThreshold: 2,
    cooldownMs: 10_000,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    random: () => 1,
    sleep,
    now: () => clock,
    ...overrides,
  });
  return {
    client,
    fetchImpl,
    sleep,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("createProviderClient — success and validation", () => {
  it("returns the validated body on 200", async () => {
    const { client, fetchImpl } = makeClient();
    fetchImpl.mockResolvedValueOnce(okResponse({ id: "f1", winner: "FighterA" }));

    await expect(client.getJson(URL, {}, Schema)).resolves.toEqual({ id: "f1", winner: "FighterA" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns null on 404 without retrying", async () => {
    const { client, fetchImpl, sleep } = makeClient();
    fetchImpl.mockResolvedValueOnce(statusResponse(404));

    await expect(client.getJson(URL, {}, Schema)).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("rejects a payload that fails zod validation without retrying", async () => {
    const { client, fetchImpl, sleep } = makeClient();
    fetchImpl.mockResolvedValueOnce(okResponse({ id: 42 }));

    await expect(client.getJson(URL, {}, Schema)).rejects.toBeInstanceOf(ProviderResponseError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    const { client, fetchImpl } = makeClient();
    fetchImpl.mockResolvedValueOnce(new Response("<html>", { status: 200 }));

    await expect(client.getJson(URL, {}, Schema)).rejects.toBeInstanceOf(ProviderResponseError);
  });

  it("treats other 4xx responses as non-retryable", async () => {
    const { client, fetchImpl, sleep } = makeClient();
    fetchImpl.mockResolvedValueOnce(statusResponse(401));

    await expect(client.getJson(URL, {}, Schema)).rejects.toBeInstanceOf(ProviderResponseError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe("createProviderClient — retries and timeouts", () => {
  it("retries 5xx and 429 responses and succeeds on a later attempt", async () => {
    const { client, fetchImpl, sleep } = makeClient();
    fetchImpl
      .mockResolvedValueOnce(statusResponse(503))
      .mockResolvedValueOnce(statusResponse(429))
      .mockResolvedValueOnce(okResponse({ id: "f1", winner: "Draw" }));

    await expect(client.getJson(URL, {}, Schema)).resolves.toEqual({ id: "f1", winner: "Draw" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("gives up after maxRetries and surfaces a TransientProviderError", async () => {
    const { client, fetchImpl, sleep } = makeClient({ failureThreshold: 10 });
    fetchImpl.mockResolvedValue(statusResponse(500));

    await expect(client.getJson(URL, {}, Schema)).rejects.toBeInstanceOf(TransientProviderError);
    // 1 initial attempt + 2 retries
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("aborts a slow provider at the request timeout and retries it", async () => {
    const { client, fetchImpl } = makeClient({ maxRetries: 1, failureThreshold: 10 });
    fetchImpl.mockImplementation((_url: string, init: RequestInit) => hangingFetch(init.signal));

    await expect(client.getJson(URL, {}, Schema)).rejects.toThrow(/timeout/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const signal = fetchImpl.mock.calls[0][1].signal as AbortSignal;
    expect(signal.aborted).toBe(true);
  });

  it("passes the caller's headers through to the provider", async () => {
    const { client, fetchImpl } = makeClient();
    fetchImpl.mockResolvedValueOnce(okResponse({ id: "f1", winner: "FighterB" }));

    await client.getJson(URL, { headers: { Authorization: "Bearer k" } }, Schema);
    expect(fetchImpl.mock.calls[0][1].headers).toEqual({ Authorization: "Bearer k" });
  });
});

describe("createProviderClient — backoff", () => {
  it("uses full jitter bounded by base * 2^attempt and maxDelay", async () => {
    const { client, fetchImpl, sleep } = makeClient({
      maxRetries: 4,
      failureThreshold: 10,
      random: () => 0.5,
    });
    fetchImpl.mockResolvedValue(statusResponse(502));

    await expect(client.getJson(URL, {}, Schema)).rejects.toBeInstanceOf(TransientProviderError);
    // cap = min(1000, 100 * 2^n) → 100, 200, 400, 800 ; delay = 0.5 * cap
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([50, 100, 200, 400]);
  });

  it("never exceeds maxDelayMs", async () => {
    const { client, fetchImpl, sleep } = makeClient({
      maxRetries: 5,
      failureThreshold: 10,
      maxDelayMs: 300,
      random: () => 0.999,
    });
    fetchImpl.mockResolvedValue(statusResponse(500));

    await expect(client.getJson(URL, {}, Schema)).rejects.toBeInstanceOf(TransientProviderError);
    for (const [delay] of sleep.mock.calls) {
      expect(delay).toBeLessThan(300);
    }
  });
});

describe("createProviderClient — circuit breaker", () => {
  it("opens after the failure threshold and rejects without calling the provider", async () => {
    const { client, fetchImpl } = makeClient({ maxRetries: 0, failureThreshold: 2 });
    fetchImpl.mockResolvedValue(statusResponse(500));

    await expect(client.getJson(URL, {}, Schema)).rejects.toBeInstanceOf(TransientProviderError);
    expect(client.state()).toBe("closed");
    await expect(client.getJson(URL, {}, Schema)).rejects.toBeInstanceOf(TransientProviderError);
    expect(client.state()).toBe("open");

    fetchImpl.mockClear();
    await expect(client.getJson(URL, {}, Schema)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("allows one trial call after the cooldown and closes on success", async () => {
    const { client, fetchImpl, advance } = makeClient({ maxRetries: 0, failureThreshold: 1 });
    fetchImpl.mockResolvedValueOnce(statusResponse(500));
    await expect(client.getJson(URL, {}, Schema)).rejects.toBeInstanceOf(TransientProviderError);
    expect(client.state()).toBe("open");

    advance(10_000);
    fetchImpl.mockResolvedValueOnce(okResponse({ id: "f1", winner: "FighterA" }));
    await expect(client.getJson(URL, {}, Schema)).resolves.toEqual({ id: "f1", winner: "FighterA" });
    expect(client.state()).toBe("closed");
  });

  it("re-opens immediately when the half-open trial fails", async () => {
    const { client, fetchImpl, advance } = makeClient({ maxRetries: 0, failureThreshold: 1 });
    fetchImpl.mockResolvedValueOnce(statusResponse(500));
    await expect(client.getJson(URL, {}, Schema)).rejects.toBeInstanceOf(TransientProviderError);

    advance(10_000);
    fetchImpl.mockResolvedValueOnce(statusResponse(500));
    await expect(client.getJson(URL, {}, Schema)).rejects.toBeInstanceOf(TransientProviderError);
    expect(client.state()).toBe("open");

    await expect(client.getJson(URL, {}, Schema)).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it("resets the failure count after a success", async () => {
    const { client, fetchImpl } = makeClient({ maxRetries: 0, failureThreshold: 2 });
    fetchImpl
      .mockResolvedValueOnce(statusResponse(500))
      .mockResolvedValueOnce(okResponse({ id: "f1", winner: "Draw" }))
      .mockResolvedValueOnce(statusResponse(500));

    await expect(client.getJson(URL, {}, Schema)).rejects.toBeInstanceOf(TransientProviderError);
    await expect(client.getJson(URL, {}, Schema)).resolves.toBeTruthy();
    await expect(client.getJson(URL, {}, Schema)).rejects.toBeInstanceOf(TransientProviderError);
    expect(client.state()).toBe("closed");
  });
});
