import express from "express";
import request from "supertest";
import { apiKeyAuth } from "../apiKeyAuth";

function buildApp(getKey: () => string) {
  const app = express();
  app.get("/protected", apiKeyAuth({ header: "x-test-key", getKey }), (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

describe("apiKeyAuth", () => {
  it("passes through when the header matches the key", async () => {
    const app = buildApp(() => "secret-value");

    const res = await request(app).get("/protected").set("x-test-key", "secret-value");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("returns 401 when the header is missing", async () => {
    const app = buildApp(() => "secret-value");

    const res = await request(app).get("/protected");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized", code: "UNAUTHORIZED" });
  });

  it("returns 401 when the key differs", async () => {
    const app = buildApp(() => "secret-value");

    const res = await request(app).get("/protected").set("x-test-key", "secret-valuX");

    expect(res.status).toBe(401);
  });

  it("returns 401 when the key is a prefix of the expected key", async () => {
    const app = buildApp(() => "secret-value");

    const res = await request(app).get("/protected").set("x-test-key", "secret");

    expect(res.status).toBe(401);
  });

  it("returns 401 when no key is configured, even if the header is sent", async () => {
    const app = buildApp(() => "");

    const res = await request(app).get("/protected").set("x-test-key", "");

    expect(res.status).toBe(401);
  });

  it("reads the expected key on each request", async () => {
    let current = "first";
    const app = buildApp(() => current);

    expect((await request(app).get("/protected").set("x-test-key", "first")).status).toBe(200);

    current = "second";
    expect((await request(app).get("/protected").set("x-test-key", "first")).status).toBe(401);
    expect((await request(app).get("/protected").set("x-test-key", "second")).status).toBe(200);
  });
});
