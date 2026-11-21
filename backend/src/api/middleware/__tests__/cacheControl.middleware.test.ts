/**
 * B-123 (#1559): Cache-Control on read routes and conditional 304 responses.
 */
import express from "express";
import request from "supertest";
import { cacheControl, privateNoStore } from "../cacheControl.middleware";

function appWith(...middleware: express.RequestHandler[]) {
  const app = express();
  app.get("/item", ...middleware, (_req, res) => {
    res.json({ id: 1, status: "Open" });
  });
  return app;
}

describe("cacheControl", () => {
  it("sends public max-age and stale-while-revalidate", async () => {
    const res = await request(appWith(cacheControl({ maxAge: 5, staleWhileRevalidate: 30 }))).get("/item");

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe(
      "public, max-age=5, stale-while-revalidate=30"
    );
  });

  it("defaults stale-while-revalidate to 0", async () => {
    const res = await request(appWith(cacheControl({ maxAge: 10 }))).get("/item");

    expect(res.headers["cache-control"]).toBe("public, max-age=10, stale-while-revalidate=0");
  });

  it("answers a conditional request with 304 when the ETag matches", async () => {
    const app = appWith(cacheControl({ maxAge: 5 }));

    const first = await request(app).get("/item");
    const etag = first.headers["etag"];
    expect(etag).toBeDefined();

    const second = await request(app).get("/item").set("If-None-Match", etag);

    expect(second.status).toBe(304);
    expect(second.headers["cache-control"]).toBe("public, max-age=5, stale-while-revalidate=0");
  });

  it.each([
    ["negative maxAge", { maxAge: -1 }],
    ["fractional maxAge", { maxAge: 1.5 }],
    ["negative staleWhileRevalidate", { maxAge: 5, staleWhileRevalidate: -2 }],
    ["NaN maxAge", { maxAge: Number.NaN }],
  ])("rejects %s when the route is built", (_label, options) => {
    expect(() => cacheControl(options)).toThrow(RangeError);
  });
});

describe("privateNoStore", () => {
  it("marks authenticated or user-specific responses as private and uncacheable", async () => {
    const res = await request(appWith(privateNoStore)).get("/item");

    expect(res.headers["cache-control"]).toBe("private, no-store");
  });
});
