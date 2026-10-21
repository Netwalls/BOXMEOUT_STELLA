import express from "express";
import request from "supertest";
import { notFoundMiddleware } from "../notFound.middleware";
import { errorHandlerMiddleware } from "../errorHandler.middleware";

// Mirrors app.ts: routes, then the 404 handler, then the error handler.
function buildApp() {
  const app = express();
  app.get("/known", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware);
  return app;
}

describe("notFoundMiddleware (B-93)", () => {
  it("returns a JSON 404 for an unknown path", async () => {
    const res = await request(app()).get("/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual(expect.objectContaining({ error: "Not found", code: "NOT_FOUND" }));
  });

  it("returns a JSON 404 for an unknown method on a known path", async () => {
    const res = await request(app()).post("/known");

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("leaves matched routes unaffected", async () => {
    const res = await request(app()).get("/known");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

function app() {
  return buildApp();
}
