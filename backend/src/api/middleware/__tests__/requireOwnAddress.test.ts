import type { Request, Response, NextFunction } from "express";
import { requireOwnAddress } from "../walletAuth.middleware";

function run(walletAddress: string | undefined, paramAddress: string) {
  const req = { params: { address: paramAddress }, walletAddress } as unknown as Request;
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const res = { status } as unknown as Response;
  const next = jest.fn() as NextFunction;

  requireOwnAddress(req, res, next);

  return { status, json, next };
}

describe("requireOwnAddress", () => {
  it("calls next when the authenticated wallet is the path address", () => {
    const { next, status } = run("GABC", "GABC");

    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it("returns 403 when the authenticated wallet is a different address", () => {
    const { next, status, json } = run("GABC", "GXYZ");

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("returns 403 when no wallet was authenticated", () => {
    const { next, status } = run(undefined, "GABC");

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });
});
