import type { Request, Response } from "express";
import * as repository from "../../../repositories/market.repository";
import { searchMarketsHandler } from "../marketSearch.controller";

jest.mock("../../../repositories/market.repository", () => ({
  searchMarkets: jest.fn(),
}));

jest.mock("../../../logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

function mockResponse() {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function request(query: Record<string, unknown>) {
  return { query } as unknown as Request;
}

describe("GET /api/markets/search handler", () => {
  beforeEach(() => {
    (repository.searchMarkets as jest.Mock).mockResolvedValue({
      data: [{ id: "m1" }],
      total: 45,
    });
  });

  it("returns results with page, limit and meta.total", async () => {
    const res = mockResponse();

    await searchMarketsHandler(request({ q: "fury", page: "2", limit: "10" }), res);

    expect(repository.searchMarkets).toHaveBeenCalledWith("fury", 2, 10);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      data: [{ id: "m1" }],
      total: 45,
      page: 2,
      limit: 10,
      meta: { total: 45, hasMore: true },
    });
  });

  it("returns 400 without touching the repository when q is missing", async () => {
    const res = mockResponse();

    await searchMarketsHandler(request({}), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "q is required", code: "VALIDATION_ERROR" }),
    );
    expect(repository.searchMarkets).not.toHaveBeenCalled();
  });

  it("returns 400 for q longer than 100 characters", async () => {
    const res = mockResponse();

    await searchMarketsHandler(request({ q: "x".repeat(101) }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(repository.searchMarkets).not.toHaveBeenCalled();
  });

  it("returns 400 for limit above 100", async () => {
    const res = mockResponse();

    await searchMarketsHandler(request({ q: "fury", limit: "500" }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(repository.searchMarkets).not.toHaveBeenCalled();
  });

  it("passes operator and quote input through as data, not as an error", async () => {
    const res = mockResponse();
    const q = '"fury" OR (wilder & -chess) :* <-> ) (';

    await searchMarketsHandler(request({ q }), res);

    expect(repository.searchMarkets).toHaveBeenCalledWith(q, 1, 20);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 500 when the repository throws", async () => {
    (repository.searchMarkets as jest.Mock).mockRejectedValue(new Error("db down"));
    const res = mockResponse();

    await searchMarketsHandler(request({ q: "fury" }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
