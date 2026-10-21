import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { Prisma } from "@prisma/client";
import {
  idempotencyMiddleware,
  type IdempotencyStore,
} from "../idempotency.middleware";
import { errorHandlerMiddleware } from "../errorHandler.middleware";
import { isUniqueConstraintError } from "../../../lib/prisma-errors";

/** In-memory stand-in for the Redis commands the middleware uses. */
function fakeStore() {
  const data = new Map<string, string>();
  const store = {
    get: jest.fn(async (key: string) => data.get(key) ?? null),
    set: jest.fn(async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes("NX") && data.has(key)) return null;
      data.set(key, value);
      return "OK";
    }),
    del: jest.fn(async (key: string) => (data.delete(key) ? 1 : 0)),
  };
  return { data, store: store as unknown as IdempotencyStore & typeof store };
}

/** Simulates walletAuthMiddleware by setting the wallet the route is scoped to. */
function asWallet(wallet: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { walletAddress?: string }).walletAddress = wallet;
    next();
  };
}

function buildApp(
  store: IdempotencyStore,
  handler: (req: Request, res: Response) => unknown,
  wallet = "GWALLETA",
) {
  const app = express();
  app.use(express.json());
  app.post("/markets", asWallet(wallet), idempotencyMiddleware(store), handler);
  app.use(errorHandlerMiddleware);
  return app;
}

const createdMarket = (_req: Request, res: Response) => {
  res.status(201).json({ data: { id: "market-1" } });
};

describe("B-103: Idempotency-Key on POST /api/markets", () => {
  it("runs the handler normally when no Idempotency-Key header is sent", async () => {
    const { store } = fakeStore();
    const handler = jest.fn(createdMarket);
    const app = buildApp(store, handler);

    await request(app).post("/markets").send({ id: "market-1" });
    await request(app).post("/markets").send({ id: "market-1" });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(store.set).not.toHaveBeenCalled();
  });

  it("replays the original response for the same key and body without running the handler again", async () => {
    const { store } = fakeStore();
    const handler = jest.fn(createdMarket);
    const app = buildApp(store, handler);
    const body = { id: "market-1", contractAddress: "CABC" };

    const first = await request(app)
      .post("/markets")
      .set("Idempotency-Key", "retry-key-1")
      .send(body);
    const replay = await request(app)
      .post("/markets")
      .set("Idempotency-Key", "retry-key-1")
      .send(body);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(replay.headers["idempotent-replayed"]).toBe("true");
    expect(first.headers["idempotent-replayed"]).toBeUndefined();
  });

  it("stores the response with a 24 hour TTL", async () => {
    const { store } = fakeStore();
    const app = buildApp(store, createdMarket);

    await request(app).post("/markets").set("Idempotency-Key", "ttl-key").send({ id: "m" });

    expect(store.set).toHaveBeenLastCalledWith(
      expect.stringContaining("ttl-key"),
      expect.any(String),
      "EX",
      24 * 60 * 60,
    );
  });

  it("returns 422 when the same key is reused with a different body", async () => {
    const { store } = fakeStore();
    const handler = jest.fn(createdMarket);
    const app = buildApp(store, handler);

    await request(app).post("/markets").set("Idempotency-Key", "k-422").send({ id: "a" });
    const conflict = await request(app)
      .post("/markets")
      .set("Idempotency-Key", "k-422")
      .send({ id: "b" });

    expect(conflict.status).toBe(422);
    expect(conflict.body.code).toBe("IDEMPOTENCY_KEY_MISMATCH");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("returns 409 while a request with the same key is still running", async () => {
    const { store } = fakeStore();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handler = jest.fn(async (_req: Request, res: Response) => {
      await gate;
      res.status(201).json({ data: { id: "market-1" } });
    });
    const app = buildApp(store, handler);
    const body = { id: "market-1" };

    // .then() starts the request; supertest sends nothing until it is awaited.
    const inFlight = request(app)
      .post("/markets")
      .set("Idempotency-Key", "slow")
      .send(body)
      .then((res) => res);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const concurrent = await request(app)
      .post("/markets")
      .set("Idempotency-Key", "slow")
      .send(body);

    expect(concurrent.status).toBe(409);
    expect(concurrent.body.code).toBe("IDEMPOTENCY_IN_PROGRESS");

    release();
    const finished = await inFlight;
    expect(finished.status).toBe(201);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("releases the key after a 5xx so the client can retry the same request", async () => {
    const { store } = fakeStore();
    let attempts = 0;
    const app = buildApp(store, (_req, res) => {
      attempts += 1;
      if (attempts === 1) {
        res.status(500).json({ error: "Internal server error" });
        return;
      }
      res.status(201).json({ data: { id: "market-1" } });
    });

    const failed = await request(app).post("/markets").set("Idempotency-Key", "flaky").send({ id: "m" });
    const retried = await request(app).post("/markets").set("Idempotency-Key", "flaky").send({ id: "m" });

    expect(failed.status).toBe(500);
    expect(retried.status).toBe(201);
    expect(attempts).toBe(2);
  });

  it("scopes keys to the wallet so two users cannot replay each other's responses", async () => {
    const { store } = fakeStore();
    const handler = jest.fn(createdMarket);
    const alice = buildApp(store, handler, "GALICE");
    const bob = buildApp(store, handler, "GBOB");

    await request(alice).post("/markets").set("Idempotency-Key", "shared").send({ id: "m" });
    const bobResponse = await request(bob).post("/markets").set("Idempotency-Key", "shared").send({ id: "m" });

    expect(bobResponse.status).toBe(201);
    expect(bobResponse.headers["idempotent-replayed"]).toBeUndefined();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("rejects an empty or over-long Idempotency-Key with 400", async () => {
    const { store } = fakeStore();
    const app = buildApp(store, createdMarket);

    const tooLong = await request(app)
      .post("/markets")
      .set("Idempotency-Key", "x".repeat(256))
      .send({ id: "m" });
    const blank = await request(app).post("/markets").set("Idempotency-Key", "   ").send({ id: "m" });

    expect(tooLong.status).toBe(400);
    expect(blank.status).toBe(400);
  });

  it("processes the request without idempotency when the store is unavailable", async () => {
    const failing = {
      get: jest.fn().mockRejectedValue(new Error("redis down")),
      set: jest.fn().mockRejectedValue(new Error("redis down")),
      del: jest.fn().mockRejectedValue(new Error("redis down")),
    } as unknown as IdempotencyStore;
    const handler = jest.fn(createdMarket);
    const app = buildApp(failing, handler);

    const res = await request(app).post("/markets").set("Idempotency-Key", "k").send({ id: "m" });

    expect(res.status).toBe(201);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("B-103: unique-constraint errors map to 409", () => {
  const uniqueViolation = () =>
    new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`id`)", {
      code: "P2002",
      clientVersion: "5.22.0",
    });

  it("detects Prisma P2002 errors and nothing else", () => {
    expect(isUniqueConstraintError(uniqueViolation())).toBe(true);
    expect(isUniqueConstraintError(new Error("other"))).toBe(false);
  });

  it("returns 409 CONFLICT from the central error handler", async () => {
    const app = express();
    app.get("/dup", () => {
      throw uniqueViolation();
    });
    app.use(errorHandlerMiddleware);

    const res = await request(app).get("/dup");

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONFLICT");
  });
});
