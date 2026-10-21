import type { Request, Response } from "express";
import * as betService from "../../../services/bet.service";
import * as userService from "../../../services/user.service";
import { getBetsByAddressHandler } from "../bet.controller";
import { getUserBetsHandler } from "../user.controller";

jest.mock("../../../services/bet.service", () => ({
  ...jest.requireActual("../../../services/bet.service"),
  getBetsByAddress: jest.fn(),
  getBetsByAddressPaginated: jest.fn(),
}));

jest.mock("../../../services/user.service", () => ({
  getUserBets: jest.fn(),
}));

const ADDRESS = "GBXRGQFPYUTG3BIFBEHHRR7SX3SG4RB4MNW2VOJTKTXWJ3J4XDPYHOQQ";

function mockResponse() {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function request(params: Record<string, string>, query: Record<string, string> = {}) {
  return { params, query } as unknown as Request;
}

const bets = Array.from({ length: 3 }, (_, i) => ({ id: `bet-${i}` }));

describe("GET /api/bets/:address (page-based)", () => {
  beforeEach(() => {
    (betService.getBetsByAddress as jest.Mock).mockResolvedValue(bets);
  });

  it("returns total and meta.hasMore for the requested page", async () => {
    const res = mockResponse();
    await getBetsByAddressHandler(request({ address: ADDRESS }, { page: "1", limit: "2" }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: bets.slice(0, 2),
        page: 1,
        limit: 2,
        total: 3,
        meta: { total: 3, hasMore: true },
      }),
    );
  });

  it("returns 400 when limit exceeds the shared cap of 100", async () => {
    const res = mockResponse();
    await getBetsByAddressHandler(request({ address: ADDRESS }, { limit: "101" }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "VALIDATION_ERROR" }));
    expect(betService.getBetsByAddress).not.toHaveBeenCalled();
  });
});

describe("GET /api/users/:address/bets (cursor-based)", () => {
  it("passes the cursor through and returns meta.nextCursor", async () => {
    (userService.getUserBets as jest.Mock).mockResolvedValue({
      bets: [{ id: "bet-1" }],
      nextCursor: "next-token",
    });
    const res = mockResponse();

    await getUserBetsHandler(request({ address: ADDRESS }, { cursor: "abc", limit: "1" }), res);

    expect(userService.getUserBets).toHaveBeenCalledWith(ADDRESS, { cursor: "abc", limit: 1 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      bets: [{ id: "bet-1" }],
      nextCursor: "next-token",
      meta: { hasMore: true, nextCursor: "next-token" },
    });
  });

  it("reports hasMore=false on the last page", async () => {
    (userService.getUserBets as jest.Mock).mockResolvedValue({ bets: [], nextCursor: null });
    const res = mockResponse();

    await getUserBetsHandler(request({ address: ADDRESS }), res);

    expect(userService.getUserBets).toHaveBeenCalledWith(ADDRESS, { cursor: undefined, limit: 20 });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ meta: { hasMore: false, nextCursor: null } }),
    );
  });

  it("returns 400 when limit is above 100", async () => {
    const res = mockResponse();

    await getUserBetsHandler(request({ address: ADDRESS }, { limit: "500" }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(userService.getUserBets).not.toHaveBeenCalled();
  });
});
