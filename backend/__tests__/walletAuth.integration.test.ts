import { randomBytes } from "crypto";
import express from "express";
import request from "supertest";
import { Keypair } from "@stellar/stellar-sdk";
import {
  generateChallenge,
  walletAuthMiddleware,
} from "../src/api/middleware/walletAuth.middleware";

const CHALLENGE_PREFIX = "BOXMEOUT-AUTH";

function buildApp(whitelist: string[]) {
  const app = express();
  app.get("/api/auth/challenge", (req, res) => {
    const address = req.query.address;
    if (typeof address !== "string" || !address) {
      res.status(400).json({ error: "address required" });
      return;
    }
    res.json(generateChallenge(address));
  });
  app.get("/api/protected", walletAuthMiddleware({ whitelist }), (req, res) => {
    res.json({ walletAddress: (req as express.Request & { walletAddress?: string }).walletAddress });
  });
  return app;
}

function signChallenge(keypair: Keypair, address: string, nonce: string): string {
  const challengeString = `${CHALLENGE_PREFIX}:${address}:${nonce}`;
  return keypair.sign(Buffer.from(challengeString)).toString("base64");
}

function nonceFromChallenge(challenge: string, address: string): string {
  return challenge.slice(`${CHALLENGE_PREFIX}:${address}:`.length);
}

describe("wallet auth challenge flow", () => {
  it("authenticates a request signed by the challenge owner", async () => {
    const keypair = Keypair.random();
    const address = keypair.publicKey();
    const app = buildApp([address]);

    const challengeRes = await request(app)
      .get("/api/auth/challenge")
      .query({ address })
      .expect(200);

    const nonce = nonceFromChallenge(challengeRes.body.challenge, address);
    const signature = signChallenge(keypair, address, nonce);

    const protectedRes = await request(app)
      .get("/api/protected")
      .set("x-wallet-address", address)
      .set("x-wallet-signature", signature)
      .expect(200);

    expect(protectedRes.body.walletAddress).toBe(address);
  });

  it("rejects an expired challenge", async () => {
    const keypair = Keypair.random();
    const address = keypair.publicKey();
    const app = buildApp([address]);

    const challengeRes = await request(app)
      .get("/api/auth/challenge")
      .query({ address })
      .expect(200);

    const nonce = nonceFromChallenge(challengeRes.body.challenge, address);
    const signature = signChallenge(keypair, address, nonce);

    // Advance past the challenge TTL so the stored entry is expired.
    const ttl = Number(process.env.WALLET_AUTH_CHALLENGE_TTL_MS ?? 5 * 60 * 1000);
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(Date.now() + ttl + 1000);
    try {
      const res = await request(app)
        .get("/api/protected")
        .set("x-wallet-address", address)
        .set("x-wallet-signature", signature)
        .expect(401);

      expect(res.body.code).toBe("CHALLENGE_EXPIRED");
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("rejects a reused challenge", async () => {
    const keypair = Keypair.random();
    const address = keypair.publicKey();
    const app = buildApp([address]);

    const challengeRes = await request(app)
      .get("/api/auth/challenge")
      .query({ address })
      .expect(200);

    const nonce = nonceFromChallenge(challengeRes.body.challenge, address);
    const signature = signChallenge(keypair, address, nonce);

    await request(app)
      .get("/api/protected")
      .set("x-wallet-address", address)
      .set("x-wallet-signature", signature)
      .expect(200);

    const res = await request(app)
      .get("/api/protected")
      .set("x-wallet-address", address)
      .set("x-wallet-signature", signature)
      .expect(401);

    expect(res.body.code).toBe("CHALLENGE_EXPIRED");
  });

  it("rejects a signature from a different signer", async () => {
    const owner = Keypair.random();
    const attacker = Keypair.random();
    const address = owner.publicKey();
    const app = buildApp([address]);

    const challengeRes = await request(app)
      .get("/api/auth/challenge")
      .query({ address })
      .expect(200);

    const nonce = nonceFromChallenge(challengeRes.body.challenge, address);
    const signature = signChallenge(attacker, address, nonce);

    const res = await request(app)
      .get("/api/protected")
      .set("x-wallet-address", address)
      .set("x-wallet-signature", signature)
      .expect(401);

    expect(res.body.code).toBe("INVALID_SIGNATURE");
  });

  it("rejects a request with no challenge issued", async () => {
    const keypair = Keypair.random();
    const address = keypair.publicKey();
    const app = buildApp([address]);

    const signature = keypair.sign(Buffer.from(randomBytes(32))).toString("base64");

    const res = await request(app)
      .get("/api/protected")
      .set("x-wallet-address", address)
      .set("x-wallet-signature", signature)
      .expect(401);

    expect(res.body.code).toBe("CHALLENGE_EXPIRED");
  });
});
