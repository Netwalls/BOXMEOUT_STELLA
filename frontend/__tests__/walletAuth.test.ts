jest.mock("@/lib/config", () => ({ API_BASE_URL: "http://api.test" }));

import { apiFetch, createMarketMeta, setAuthSigner, WalletAuthError } from "@/lib/api";

const ADDRESS = "GADDRTEST";
const CHALLENGE = "BOXMEOUT-AUTH:GADDRTEST:nonce1";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status ${status}`,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

/** Routes the challenge endpoint and the protected endpoint separately. */
function routeFetch(protectedResponses: ReturnType<typeof jsonResponse>[]) {
  let protectedCalls = 0;
  let challengeCounter = 0;
  return jest.fn(async (url: string) => {
    if (url.includes("/api/auth/challenge")) {
      challengeCounter += 1;
      return jsonResponse(200, { challenge: `${CHALLENGE}-${challengeCounter}`, expiresAt: Date.now() + 300_000 });
    }
    const response = protectedResponses[Math.min(protectedCalls, protectedResponses.length - 1)];
    protectedCalls += 1;
    return response;
  });
}

function userRejected() {
  const err = new Error("User declined access");
  err.name = "UserRejectedError";
  return err;
}

afterEach(() => {
  setAuthSigner(null);
  jest.restoreAllMocks();
});

test("auth: signs the server challenge and attaches wallet headers", async () => {
  const signMessage = jest.fn().mockResolvedValue("c2lnbmF0dXJl");
  setAuthSigner({ address: ADDRESS, signMessage });
  global.fetch = routeFetch([jsonResponse(200, { success: true })]) as unknown as typeof fetch;

  await createMarketMeta({} as never);

  expect(signMessage).toHaveBeenCalledWith(`${CHALLENGE}-1`);
  const [challengeUrl] = (global.fetch as jest.Mock).mock.calls[0];
  expect(challengeUrl).toContain(`/api/auth/challenge?address=${ADDRESS}`);
  const [, init] = (global.fetch as jest.Mock).mock.calls[1];
  expect(init.headers).toMatchObject({
    "x-wallet-address": ADDRESS,
    "x-wallet-signature": "c2lnbmF0dXJl",
  });
});

test("auth: reuses the cached signature for later calls instead of re-signing", async () => {
  const signMessage = jest.fn().mockResolvedValue("sig");
  setAuthSigner({ address: ADDRESS, signMessage });
  global.fetch = routeFetch([jsonResponse(200, { success: true })]) as unknown as typeof fetch;

  await createMarketMeta({} as never);
  await createMarketMeta({} as never);

  expect(signMessage).toHaveBeenCalledTimes(1);
  const challengeCalls = (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
    String(url).includes("/api/auth/challenge"),
  );
  expect(challengeCalls).toHaveLength(1);
});

test("auth: re-challenges once after a 401 and then succeeds", async () => {
  const signMessage = jest.fn().mockResolvedValueOnce("stale").mockResolvedValueOnce("fresh");
  setAuthSigner({ address: ADDRESS, signMessage });
  global.fetch = routeFetch([
    jsonResponse(401, { error: "Signature expired", code: "UNAUTHORIZED" }),
    jsonResponse(200, { success: true }),
  ]) as unknown as typeof fetch;

  await expect(createMarketMeta({} as never)).resolves.toEqual({ success: true });

  expect(signMessage).toHaveBeenCalledTimes(2);
  const protectedCalls = (global.fetch as jest.Mock).mock.calls.filter(([url]) => !String(url).includes("challenge"));
  expect(protectedCalls[1][1].headers["x-wallet-signature"]).toBe("fresh");
});

test("auth: gives up after one re-challenge if the server keeps rejecting", async () => {
  const signMessage = jest.fn().mockResolvedValue("sig");
  setAuthSigner({ address: ADDRESS, signMessage });
  global.fetch = routeFetch([jsonResponse(401, { error: "nope", code: "UNAUTHORIZED" })]) as unknown as typeof fetch;

  await expect(createMarketMeta({} as never)).rejects.toMatchObject({ status: 401 });
  expect(signMessage).toHaveBeenCalledTimes(2);
});

test("auth: a declined signature surfaces as a cancelled WalletAuthError", async () => {
  setAuthSigner({ address: ADDRESS, signMessage: jest.fn().mockRejectedValue(userRejected()) });
  global.fetch = routeFetch([jsonResponse(200, {})]) as unknown as typeof fetch;

  const err = await createMarketMeta({} as never).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(WalletAuthError);
  expect(err).toMatchObject({ cancelled: true });
  // The protected request must never be sent without a signature.
  expect((global.fetch as jest.Mock).mock.calls.some(([url]) => !String(url).includes("challenge"))).toBe(false);
});

test("auth: a non-decline signing failure is not reported as cancelled", async () => {
  setAuthSigner({ address: ADDRESS, signMessage: jest.fn().mockRejectedValue(new Error("boom")) });
  global.fetch = routeFetch([jsonResponse(200, {})]) as unknown as typeof fetch;

  const err = await createMarketMeta({} as never).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(WalletAuthError);
  expect(err).toMatchObject({ cancelled: false });
});

test("auth: fails fast with no signer and sends nothing", async () => {
  global.fetch = jest.fn();
  await expect(createMarketMeta({} as never)).rejects.toBeInstanceOf(WalletAuthError);
  expect(global.fetch).not.toHaveBeenCalled();
});

test("auth: a new signer address discards the previous cached signature", async () => {
  const signMessage = jest.fn().mockResolvedValue("sig");
  setAuthSigner({ address: ADDRESS, signMessage });
  global.fetch = routeFetch([jsonResponse(200, {})]) as unknown as typeof fetch;
  await createMarketMeta({} as never);

  setAuthSigner({ address: "GOTHER", signMessage });
  await createMarketMeta({} as never);

  expect(signMessage).toHaveBeenCalledTimes(2);
});

test("apiFetch: calls without auth never fetch a challenge", async () => {
  global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, []));
  setAuthSigner({ address: ADDRESS, signMessage: jest.fn() });
  await apiFetch("/api/markets");
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect((global.fetch as jest.Mock).mock.calls[0][0]).not.toContain("challenge");
});
