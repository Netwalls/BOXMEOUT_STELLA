import type { Response } from "express";
import { fail, ok } from "../response";

function mockRes() {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res) as unknown as Response["status"];
  res.json = jest.fn().mockReturnValue(res) as unknown as Response["json"];
  return res;
}

describe("ok()", () => {
  it("wraps data in { data } with status 200 by default", () => {
    const res = mockRes();
    ok(res, { id: "m1" });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: { id: "m1" } });
  });

  it("adds meta when given and honours a custom status", () => {
    const res = mockRes();
    ok(res, [1, 2], { status: 201, meta: { page: 1, limit: 2 } });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ data: [1, 2], meta: { page: 1, limit: 2 } });
  });

  it("omits meta when not given", () => {
    const res = mockRes();
    ok(res, null);
    expect(res.json).toHaveBeenCalledWith({ data: null });
  });
});

describe("fail()", () => {
  it("returns { error: { code, message } }", () => {
    const res = mockRes();
    fail(res, 404, "NOT_FOUND", "Market not found");
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: { code: "NOT_FOUND", message: "Market not found" } });
  });

  it("includes details and requestId only when given", () => {
    const res = mockRes();
    fail(res, 400, "VALIDATION_ERROR", "Validation failed", {
      details: { fieldErrors: {} },
      requestId: "req-1",
    });
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: { fieldErrors: {} },
        requestId: "req-1",
      },
    });
  });
});
