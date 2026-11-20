/**
 * B-124 (#1560): response compression, SSE exclusion and the enable flag.
 */
import express from "express";
import request from "supertest";
import { createCompressionMiddleware } from "../compression.middleware";

function buildApp(enabled: boolean) {
  const app = express();
  app.use(createCompressionMiddleware(enabled));

  const rows = Array.from({ length: 200 }, (_, i) => ({
    id: `market-${i}`,
    question: "Will the fighter win by knockout in round six?",
  }));

  app.get("/large", (_req, res) => {
    res.json({ data: rows });
  });
  app.get("/small", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/stream", (_req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.flushHeaders();
    res.write(": connected\n\n");
    res.end();
  });
  return app;
}

describe("createCompressionMiddleware", () => {
  it("gzips a large JSON response when the client accepts gzip", async () => {
    const res = await request(buildApp(true))
      .get("/large")
      .set("Accept-Encoding", "gzip");

    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(res.body.data).toHaveLength(200);
  });

  it("leaves a small response uncompressed below the threshold", async () => {
    const res = await request(buildApp(true))
      .get("/small")
      .set("Accept-Encoding", "gzip");

    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(res.body).toEqual({ ok: true });
  });

  it("does not compress when the client does not accept encodings", async () => {
    const res = await request(buildApp(true))
      .get("/large")
      .set("Accept-Encoding", "identity");

    expect(res.headers["content-encoding"]).toBeUndefined();
  });

  it("never compresses text/event-stream responses", async () => {
    const res = await request(buildApp(true))
      .get("/stream")
      .set("Accept-Encoding", "gzip");

    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(res.text).toContain(": connected");
  });

  it("is a pass-through when COMPRESSION_ENABLED is off", async () => {
    const res = await request(buildApp(false))
      .get("/large")
      .set("Accept-Encoding", "gzip");

    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(res.body.data).toHaveLength(200);
  });
});
