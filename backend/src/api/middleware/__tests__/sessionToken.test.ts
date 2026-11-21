/**
 * B-132: session tokens issued after a wallet challenge.
 * Covers replay, expiry, wrong address, tampering, denylist and logout.
 */
import express from "express";
import request from "supertest";
import { Keypair } from "@stellar/stellar-sdk";
import {
  issueSessionToken,
  verifySessionToken,
  revokeSession,
  isSessionRevoked,
  resetSessionDenylistForTests,
  SESSION_TTL_SECONDS,
} from "../sessionToken";
import { generateChallenge, walletAuthMiddleware } from "../walletAuth.middleware";
import { verifyHandler, logoutHandler, getChallengeHandler } from "../../controllers/auth.controller";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.get("/challenge", getChallengeHandler);
  app.post("/verify", verifyHandler);
  app.post("/logout", logoutHandler);
  app.get("/guarded", walletAuthMiddleware({ whitelist: [] }), (req, res) => {
    res.json({ walletAddress: (req as express.Request & { walletAddress?: string }).walletAddress });
  });
  return app;
}

async function signedLogin(app: express.Express, kp: Keypair) {
  const ch = await request(app).get("/challenge").query({ address: kp.publicKey() });
  const challenge: string = ch.body.data?.challenge ?? ch.body.challenge;
  const signature = kp.sign(Buffer.from(challenge)).toString("base64");
  return request(app).post("/verify").send({ address: kp.publicKey(), signature });
}

describe("session tokens (B-132)", () => {
  let app: express.Express;
  let kp: Keypair;

  beforeEach(() => {
    resetSessionDenylistForTests();
    app = buildApp();
    kp = Keypair.random();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("issues a token bound to the address after a valid signed challenge", async () => {
    const res = await signedLogin(app, kp);
    expect(res.status).toBe(200);
    const token: string = res.body.data?.token ?? res.body.token;
    const claims = verifySessionToken(token);
    expect(claims?.sub).toBe(kp.publicKey());
    expect((claims!.exp - claims!.iat)).toBe(SESSION_TTL_SECONDS);
  });

  it("rejects a replayed verify because the challenge was consumed", async () => {
    const ch = await request(app).get("/challenge").query({ address: kp.publicKey() });
    const challenge: string = ch.body.data?.challenge ?? ch.body.challenge;
    const signature = kp.sign(Buffer.from(challenge)).toString("base64");

    const first = await request(app).post("/verify").send({ address: kp.publicKey(), signature });
    const replay = await request(app).post("/verify").send({ address: kp.publicKey(), signature });
    expect(first.status).toBe(200);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("CHALLENGE_EXPIRED");
  });

  it("rejects a signature made by a different key", async () => {
    await request(app).get("/challenge").query({ address: kp.publicKey() });
    const attacker = Keypair.random();
    const challenge = await generateChallenge(kp.publicKey());
    const bad = attacker.sign(Buffer.from(challenge.challenge)).toString("base64");
    const res = await request(app).post("/verify").send({ address: kp.publicKey(), signature: bad });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_SIGNATURE");
  });

  it("rejects an expired token", async () => {
    const { token } = issueSessionToken(kp.publicKey());
    const future = Date.now() + (SESSION_TTL_SECONDS + 1) * 1000;
    jest.spyOn(Date, "now").mockReturnValue(future);

    expect(verifySessionToken(token)).toBeNull();
    const res = await request(app).get("/guarded").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
  });

  it("rejects a tampered payload", () => {
    const { token } = issueSessionToken(kp.publicKey());
    const [, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ sub: Keypair.random().publicKey(), jti: "x", iat: 1, exp: 9999999999, typ: "session" }),
    ).toString("base64url");
    expect(verifySessionToken(`${forged}.${sig}`)).toBeNull();
    expect(verifySessionToken("not-a-token")).toBeNull();
  });

  it("refuses a token used with another wallet's address header", async () => {
    const { token } = issueSessionToken(kp.publicKey());
    const res = await request(app)
      .get("/guarded")
      .set("Authorization", `Bearer ${token}`)
      .set("x-wallet-address", Keypair.random().publicKey());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("WALLET_MISMATCH");
  });

  it("accepts a valid bearer token and exposes the bound address", async () => {
    const { token } = issueSessionToken(kp.publicKey());
    const res = await request(app).get("/guarded").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.walletAddress).toBe(kp.publicKey());
  });

  it("revokes a token on logout via the denylist", async () => {
    const res = await signedLogin(app, kp);
    const token: string = res.body.data?.token ?? res.body.token;

    const out = await request(app).post("/logout").set("Authorization", `Bearer ${token}`);
    expect(out.status).toBe(200);

    expect(await isSessionRevoked(verifySessionToken(token)!.jti)).toBe(true);
    const after = await request(app).get("/guarded").set("Authorization", `Bearer ${token}`);
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe("TOKEN_REVOKED");
  });

  it("keeps a denylist entry only until the token would have expired", async () => {
    const { token } = issueSessionToken(kp.publicKey());
    const claims = verifySessionToken(token)!;
    const now = Date.now();
    await revokeSession(claims, now);
    expect(await isSessionRevoked(claims.jti, now)).toBe(true);
    expect(await isSessionRevoked(claims.jti, claims.exp * 1000 + 1)).toBe(false);
  });

  it("logout requires a valid bearer token", async () => {
    const res = await request(app).post("/logout");
    expect(res.status).toBe(401);
  });
});
