/**
 * B-133 (#1569): owner-only notification routes. Signatures are real: the test
 * issues a challenge with generateChallenge and signs it with a Stellar keypair,
 * so the wallet-auth middleware runs unmodified.
 */
import request from "supertest";
import express from "express";
import { Keypair } from "@stellar/stellar-sdk";
import usersRoutes from "../src/api/routes/users.routes";
import { generateChallenge } from "../src/api/middleware/walletAuth.middleware";
import * as notificationService from "../src/services/notification.service";

jest.mock("../src/services/notification.service", () => {
  const actual = jest.requireActual("../src/services/notification.service");
  return {
    ...actual,
    listNotifications: jest.fn(),
    markNotificationsRead: jest.fn(),
  };
});
jest.mock("../src/db", () => ({ db: {} }));
jest.mock("../src/services/bet.service", () => ({}));
jest.mock("../src/services/user.service", () => ({
  getUserByAddress: jest.fn(),
  updateUser: jest.fn(),
  getUserBets: jest.fn(),
}));
jest.mock("../src/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  httpLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mockedList = jest.mocked(notificationService.listNotifications);
const mockedMark = jest.mocked(notificationService.markNotificationsRead);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/users", usersRoutes);
  return app;
}

async function signedHeaders(keypair: Keypair) {
  const { challenge } = await generateChallenge(keypair.publicKey());
  const signature = keypair.sign(Buffer.from(challenge)).toString("base64");
  return {
    "x-wallet-address": keypair.publicKey(),
    "x-wallet-signature": signature,
  };
}

describe("#1569 GET /api/users/:address/notifications", () => {
  it("rejects requests without a wallet signature", async () => {
    const owner = Keypair.random();
    const res = await request(createApp()).get(`/api/users/${owner.publicKey()}/notifications`);
    expect(res.status).toBe(401);
    expect(mockedList).not.toHaveBeenCalled();
  });

  it("returns 403 when a valid signer requests another wallet's notifications", async () => {
    const signer = Keypair.random();
    const victim = Keypair.random();
    const headers = await signedHeaders(signer);

    const res = await request(createApp())
      .get(`/api/users/${victim.publicKey()}/notifications`)
      .set(headers);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(mockedList).not.toHaveBeenCalled();
  });

  it("returns the owner's page with nextCursor metadata", async () => {
    const owner = Keypair.random();
    mockedList.mockResolvedValue({
      items: [{ id: "n1", type: "MarketResolved", marketId: "m1", payload: {}, readAt: null, createdAt: new Date() }] as never,
      nextCursor: "n1",
    });
    const headers = await signedHeaders(owner);

    const res = await request(createApp())
      .get(`/api/users/${owner.publicKey()}/notifications?unread=true&limit=5`)
      .set(headers);

    expect(res.status).toBe(200);
    expect(res.body.data[0].id).toBe("n1");
    expect(res.body.meta.nextCursor).toBe("n1");
    expect(mockedList).toHaveBeenCalledWith(owner.publicKey(), {
      unreadOnly: true,
      cursor: undefined,
      limit: 5,
    });
  });

  it("returns 400 for an out-of-range limit", async () => {
    const owner = Keypair.random();
    const headers = await signedHeaders(owner);
    const res = await request(createApp())
      .get(`/api/users/${owner.publicKey()}/notifications?limit=500`)
      .set(headers);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("#1569 POST /api/users/:address/notifications/read", () => {
  it("returns 403 for a wallet that does not own the address", async () => {
    const signer = Keypair.random();
    const victim = Keypair.random();
    const headers = await signedHeaders(signer);

    const res = await request(createApp())
      .post(`/api/users/${victim.publicKey()}/notifications/read`)
      .set(headers)
      .send({});

    expect(res.status).toBe(403);
    expect(mockedMark).not.toHaveBeenCalled();
  });

  it("marks the owner's notifications read and reports the count", async () => {
    const owner = Keypair.random();
    mockedMark.mockResolvedValue(2);
    const headers = await signedHeaders(owner);

    const res = await request(createApp())
      .post(`/api/users/${owner.publicKey()}/notifications/read`)
      .set(headers)
      .send({ ids: ["n1", "n2"] });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ updated: 2 });
    expect(mockedMark).toHaveBeenCalledWith(owner.publicKey(), ["n1", "n2"]);
  });

  it("rejects an empty ids array", async () => {
    const owner = Keypair.random();
    const headers = await signedHeaders(owner);
    const res = await request(createApp())
      .post(`/api/users/${owner.publicKey()}/notifications/read`)
      .set(headers)
      .send({ ids: [] });
    expect(res.status).toBe(400);
    expect(mockedMark).not.toHaveBeenCalled();
  });
});
