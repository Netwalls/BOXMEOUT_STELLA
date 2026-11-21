/**
 * B-130: malformed params, query and body must produce a 400 VALIDATION_ERROR
 * envelope before reaching a handler. Each schema is exercised through the real
 * validate() middleware on a minimal Express app.
 */
import express from "express";
import request from "supertest";
import { validate } from "../../middleware/validate";
import {
  addressParams,
  auditLogsQuery,
  createOracleBody,
  oracleResultsQuery,
  payoutEstimateQuery,
  submitOracleResultBody,
  updateOracleBody,
  userBetsQuery,
} from "../routes.schema";

const VALID_ADDRESS = "G" + "A".repeat(55);
const ok = (_req: express.Request, res: express.Response) => {
  res.status(200).json({ ok: true });
};

function appFor(schemas: Parameters<typeof validate>[0], path = "/x/:address") {
  const app = express();
  app.use(express.json());
  app.post(path, validate(schemas), ok);
  app.get(path, validate(schemas), ok);
  return app;
}

function expect400(res: request.Response) {
  expect(res.status).toBe(400);
  expect(res.body.code).toBe("VALIDATION_ERROR");
  expect(res.body.details).toBeDefined();
}

describe("route params", () => {
  const app = appFor({ params: addressParams });

  it("rejects a malformed :address with 400", async () => {
    expect400(await request(app).get("/x/not-an-address"));
  });

  it("accepts a valid Stellar public key", async () => {
    const { Keypair } = await import("@stellar/stellar-sdk");
    const key = Keypair.random().publicKey();
    const res = await request(app).get(`/x/${key}`);
    expect(res.status).toBe(200);
  });
});

describe("query schemas", () => {
  it("coerces and bounds the bets cursor limit", async () => {
    const app = appFor({ query: userBetsQuery }, "/q");
    expect400(await request(app).get("/q?limit=500"));
    expect400(await request(app).get("/q?limit=abc"));
    expect((await request(app).get("/q?limit=5")).status).toBe(200);
  });

  it("requires a positive integer amount and a known side on payout estimates", async () => {
    const app = appFor({ query: payoutEstimateQuery }, "/p");
    expect400(await request(app).get("/p?market_id=m1&side=FighterA&amount=0"));
    expect400(await request(app).get("/p?market_id=m1&side=Draw&amount=10"));
    expect400(await request(app).get("/p?market_id=m1&side=FighterA&amount=1.5"));
    expect((await request(app).get("/p?market_id=m1&side=FighterA&amount=10")).status).toBe(200);
  });

  it("bounds oracle results pagination and validates confirmed", async () => {
    const app = appFor({ query: oracleResultsQuery }, "/r");
    expect400(await request(app).get("/r?pageSize=101"));
    expect400(await request(app).get("/r?confirmed=yes"));
    expect((await request(app).get("/r?confirmed=true&pageSize=10")).status).toBe(200);
  });

  it("validates audit-log filters", async () => {
    const app = appFor({ query: auditLogsQuery }, "/a");
    expect400(await request(app).get("/a?limit=0"));
    expect400(await request(app).get("/a?startDate=not-a-date"));
    expect((await request(app).get("/a?page=1&limit=10")).status).toBe(200);
  });
});

describe("body schemas", () => {
  it("rejects unknown keys on oracle create", async () => {
    const app = appFor({ body: createOracleBody }, "/o");
    expect400(await request(app).post("/o").send({ address: VALID_ADDRESS, name: "x", extra: 1 }));
  });

  it("requires at least one field on oracle update", async () => {
    const app = appFor({ body: updateOracleBody }, "/o");
    expect400(await request(app).post("/o").send({}));
    expect((await request(app).post("/o").send({ active: false })).status).toBe(200);
  });

  it("rejects an unknown outcome on oracle submit", async () => {
    const app = appFor({ body: submitOracleResultBody }, "/s");
    expect400(
      await request(app).post("/s").send({ market_id: "m1", outcome: "Maybe", source: "src" }),
    );
  });
});
