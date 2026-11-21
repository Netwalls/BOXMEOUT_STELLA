// B-144 (#1580): GET /api/v1/markets/:id/disputes and disputeWindowEndsAt.
// Written only; not executed as part of this change.

jest.mock("../../db", () => ({
  db: {
    market: { findUnique: jest.fn() },
    dispute: { findMany: jest.fn(), count: jest.fn() },
  },
}));

import { db } from "../../db";
import { disputeWindowEndsAt, getMarketDisputes } from "../../services/market.service";

const mockDb = db as unknown as {
  market: { findUnique: jest.Mock };
  dispute: { findMany: jest.Mock; count: jest.Mock };
};

describe("disputeWindowEndsAt", () => {
  it("adds the dispute window to bettingEndsAt", () => {
    const bettingEndsAt = new Date("2026-11-01T00:00:00Z");
    const end = disputeWindowEndsAt({ bettingEndsAt });
    expect(end.getTime() - bettingEndsAt.getTime()).toBe(86_400_000);
  });
});

describe("getMarketDisputes", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns null for an unknown market so the route can 404", async () => {
    mockDb.market.findUnique.mockResolvedValue(null);
    await expect(getMarketDisputes("missing", { page: 1, pageSize: 20 })).resolves.toBeNull();
    expect(mockDb.dispute.findMany).not.toHaveBeenCalled();
  });

  it("pages newest-first and returns total", async () => {
    mockDb.market.findUnique.mockResolvedValue({ id: "m1" });
    mockDb.dispute.findMany.mockResolvedValue([{ id: "d1" }]);
    mockDb.dispute.count.mockResolvedValue(3);

    const result = await getMarketDisputes("m1", { page: 2, pageSize: 1 });

    expect(mockDb.dispute.findMany).toHaveBeenCalledWith({
      where: { marketId: "m1" },
      orderBy: { raisedAt: "desc" },
      skip: 1,
      take: 1,
    });
    expect(result).toEqual({ data: [{ id: "d1" }], total: 3, page: 2, pageSize: 1 });
  });
});
