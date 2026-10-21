/**
 * B-59: requestId middleware tests
 *
 * Verifies that the middleware:
 *   1. Generates a UUID when no X-Request-Id header is present
 *   2. Accepts and forwards an existing X-Request-Id header
 *   3. Attaches the ID to req.id
 *   4. Echoes the ID in the X-Request-Id response header
 */

import { requestIdMiddleware, REQUEST_ID_HEADER } from "../requestId.middleware";
import type { Request, Response, NextFunction } from "express";

function makeReqRes(headers: Record<string, string> = {}): {
  req: Request & { id?: string };
  res: { setHeader: jest.Mock; getHeader: jest.Mock };
  next: jest.Mock;
} {
  const req = { headers } as unknown as Request & { id?: string };
  const responseHeaders: Record<string, string> = {};
  const res = {
    setHeader: jest.fn((key: string, value: string) => {
      responseHeaders[key.toLowerCase()] = value;
    }),
    getHeader: jest.fn((key: string) => responseHeaders[key.toLowerCase()]),
  };
  const next = jest.fn();
  return { req, res: res as unknown as typeof res, next };
}

describe("B-59: requestId middleware", () => {
  it("generates a UUID when no X-Request-Id header is provided", () => {
    const { req, res, next } = makeReqRes();
    requestIdMiddleware(req, res as unknown as Response, next as unknown as NextFunction);

    expect(req.id).toBeDefined();
    expect(typeof req.id).toBe("string");
    // UUID v4 pattern
    expect(req.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("uses the incoming X-Request-Id when provided", () => {
    const incoming = "my-custom-request-id-123";
    const { req, res, next } = makeReqRes({ [REQUEST_ID_HEADER]: incoming });
    requestIdMiddleware(req, res as unknown as Response, next as unknown as NextFunction);

    expect(req.id).toBe(incoming);
  });

  it("echoes the request ID in the response X-Request-Id header", () => {
    const { req, res, next } = makeReqRes();
    requestIdMiddleware(req, res as unknown as Response, next as unknown as NextFunction);

    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.id);
  });

  it("echoes the incoming X-Request-Id in the response header", () => {
    const incoming = "trace-abc-456";
    const { req, res, next } = makeReqRes({ [REQUEST_ID_HEADER]: incoming });
    requestIdMiddleware(req, res as unknown as Response, next as unknown as NextFunction);

    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, incoming);
  });

  it("calls next() to continue the middleware chain", () => {
    const { req, res, next } = makeReqRes();
    requestIdMiddleware(req, res as unknown as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("generates different IDs for different requests", () => {
    const { req: req1, res: res1, next: next1 } = makeReqRes();
    const { req: req2, res: res2, next: next2 } = makeReqRes();

    requestIdMiddleware(req1, res1 as unknown as Response, next1 as unknown as NextFunction);
    requestIdMiddleware(req2, res2 as unknown as Response, next2 as unknown as NextFunction);

    expect(req1.id).not.toBe(req2.id);
  });

  it("ignores an empty X-Request-Id header and generates a UUID", () => {
    const { req, res, next } = makeReqRes({ [REQUEST_ID_HEADER]: "   " });
    requestIdMiddleware(req, res as unknown as Response, next as unknown as NextFunction);

    // Should have generated a UUID, not used the whitespace-only value
    expect(req.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
