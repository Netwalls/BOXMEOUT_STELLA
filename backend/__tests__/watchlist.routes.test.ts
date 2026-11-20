/**
 * B-134 (#1570): owner-only watchlist routes with real wallet signatures.
 */
import request from "supertest";
import express from "express";
import { Keypair } from "@stellar/stellar-sdk";
import usersRoutes from "../src/api/routes/users.routes";
import { generateChallenge } from "../src/api/middleware/walletAuth.middleware";
import * as watchlistService from "../src/services/watchlist.service";
import { WatchlistError } from "../src/services/watchlist.service";

jest.mock("../src/db", () => ({ db: {} }));
jest.mock("../src/services/bet.service", () => ({}));
jest.mock("../src/services/user.service", () => ({
  getUserByAddress: jest.fn(),
  updateUser: jest.fn(),
  getUserBets: jest.fn(),
}));
jest.mock("../src/services/watchlist.service", () => {
  const actual = jest.requireActual("../src/services/watchlist.service");
  return {
    ...actual,
    listWatchlist: jest.fn(),
    addToWatchlist: jest.fn(),
    removeFromWatchlist: jest.fn(),
  };
});
jest.mock("../src/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  httpLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mockedList = jest.mocked(watchlistService.listWatchlist);
const mockedAdd = jest.mocked(watchlistService.addToWatchlist);
const mockedRemove = jest.mocked(watchlistService.removeFromWatchlist);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/users", usersRoutes);
  return app;
}

async function signedHeaders(keypair: Keypair) {
  const { challenge } = await generateChallenge(keypair.publicKey());
  return {
    "x-wallet-address": keypair.publicKey(),
    "x-wallet-signature": keypair.sign(Buffer.from(challenge)).toString("base64"),
  };
}

describe("#1570 watchlist routes — owner only", () => {
  it("returns 403 when another wallet reads the watchlist", async () => {
    const signer = Keypair.random();
    const victim = Keypair.random();
    const res = await request(createApp())
      .get(`/api/users/${victim.publicKey()}/watchlist`)
      .set(await signedHeaders(signer));
    expect(res.status).toBe(403);
    expect(mockedList).not.toHaveBeenCalled();
  });

  it("returns 403 when another wallet adds or removes a watch", async () => {
    const signer = Keypair.random();
    const victim = Keypair.random();
    const headers = await signedHeaders(signer);

    const put = await request(createApp())
      .put(`/api/users/${victim.publicKey()}/watchlist/m1`)
      .set(headers);
    const del = await request(createApp())
      .delete(`/api/users/${victim.publicKey()}/watchlist/m1`)
      .set(await signedHeaders(signer));

    expect(put.status).toBe(403);
    expect(del.status).toBe(403);
    expect(mockedAdd).not.toHaveBeenCalled();
    expect(mockedRemove).not.toHaveBeenCalled();
  });

  it("returns 401 without a signature", async () => {
    const owner = Keypair.random();
    const res = await request(createApp()).get(`/api/users/${owner.publicKey()}/watchlist`);
    expect(res.status).toBe(401);
  });
});

describe("#1570 watchlist routes — behaviour", () => {
  it("lists the owner's watches", async () => {
    const owner = Keypair.random();
    mockedList.mockResolvedValue([{ marketId: "m1", createdAt: new Date("2026-01-01T00:00:00Z") }] as never);
    const res = await request(createApp())
      .get(`/api/users/${owner.publicKey()}/watchlist`)
      .set(await signedHeaders(owner));
    expect(res.status).toBe(200);
    expect(res.body.data[0].marketId).toBe("m1");
  });

  it("PUT returns created:true for a new watch", async () => {
    const owner = Keypair.random();
    mockedAdd.mockResolvedValue({ created: true });
    const res = await request(createApp())
      .put(`/api/users/${owner.publicKey()}/watchlist/m1`)
      .set(await signedHeaders(owner));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ marketId: "m1", watched: true, created: true });
  });

  it("PUT is idempotent and reports created:false when already watched", async () => {
    const owner = Keypair.random();
    mockedAdd.mockResolvedValue({ created: false });
    const res = await request(createApp())
      .put(`/api/users/${owner.publicKey()}/watchlist/m1`)
      .set(await signedHeaders(owner));
    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(false);
  });

  it("returns 422 with a clear code when the cap is reached", async () => {
    const owner = Keypair.random();
    mockedAdd.mockRejectedValue(new WatchlistError("WATCHLIST_LIMIT_REACHED", "Watchlist is limited to 200 markets"));
    const res = await request(createApp())
      .put(`/api/users/${owner.publicKey()}/watchlist/m1`)
      .set(await signedHeaders(owner));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("WATCHLIST_LIMIT_REACHED");
  });

  it("returns 404 for an unknown market", async () => {
    const owner = Keypair.random();
    mockedAdd.mockRejectedValue(new WatchlistError("MARKET_NOT_FOUND", "Market not found"));
    const res = await request(createApp())
      .put(`/api/users/${owner.publicKey()}/watchlist/nope`)
      .set(await signedHeaders(owner));
    expect(res.status).toBe(404);
  });

  it("DELETE reports whether a row was removed", async () => {
    const owner = Keypair.random();
    mockedRemove.mockResolvedValue(0);
    const res = await request(createApp())
      .delete(`/api/users/${owner.publicKey()}/watchlist/m1`)
      .set(await signedHeaders(owner));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ marketId: "m1", removed: false });
  });
});
