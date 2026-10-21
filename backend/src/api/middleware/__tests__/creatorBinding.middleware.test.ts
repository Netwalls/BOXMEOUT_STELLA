import type { Request, Response } from "express";
import { enforceCreatorBinding } from "../creatorBinding.middleware";

function mockResponse() {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const WALLET = "GCREATORWALLETADDRESSFORTESTSONLYXXXXXXXXXXXXXXXXXXXXXXXXX";

describe("enforceCreatorBinding", () => {
  it("calls next when createdBy matches the authenticated wallet", () => {
    const req = { body: { createdBy: WALLET }, walletAddress: WALLET } as unknown as Request;
    const res = mockResponse();
    const next = jest.fn();

    enforceCreatorBinding(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 403 CREATOR_MISMATCH when createdBy differs from the signing wallet", () => {
    const req = {
      body: { createdBy: "GOTHERWALLET" },
      walletAddress: WALLET,
    } as unknown as Request;
    const res = mockResponse();
    const next = jest.fn();

    enforceCreatorBinding(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "CREATOR_MISMATCH" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when no authenticated wallet is attached to the request", () => {
    const req = { body: { createdBy: WALLET } } as unknown as Request;
    const res = mockResponse();
    const next = jest.fn();

    enforceCreatorBinding(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "WALLET_AUTH_REQUIRED" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when createdBy is missing from the body", () => {
    const req = { body: {}, walletAddress: WALLET } as unknown as Request;
    const res = mockResponse();
    const next = jest.fn();

    enforceCreatorBinding(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
