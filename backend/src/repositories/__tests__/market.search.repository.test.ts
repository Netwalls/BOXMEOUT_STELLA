/**
 * Verifies the search SQL keeps user input as a bound parameter and uses
 * websearch_to_tsquery, so operators and quotes cannot change the query text.
 */

const mockQueryRaw = jest.fn();
jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({ $queryRaw: mockQueryRaw })),
}));

const mockGet = jest.fn();
const mockSetex = jest.fn();
jest.mock("ioredis", () =>
  jest.fn().mockImplementation(() => ({ get: mockGet, setex: mockSetex })),
);

import { searchMarkets } from "../market.repository";

function sqlText(call: unknown[]): string {
  const strings = call[0] as TemplateStringsArray;
  return Array.from(strings).join("?");
}

describe("searchMarkets SQL", () => {
  beforeEach(() => {
    mockGet.mockResolvedValue(null);
    mockSetex.mockResolvedValue("OK");
    mockQueryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: BigInt(0) }]);
  });

  it("uses websearch_to_tsquery and never plainto_tsquery or to_tsquery", async () => {
    await searchMarkets("fury", 1, 20);

    for (const call of mockQueryRaw.mock.calls) {
      const sql = sqlText(call);
      expect(sql).toContain("websearch_to_tsquery");
      expect(sql).not.toMatch(/\bplainto_tsquery\b|\bto_tsquery\(/);
    }
  });

  it("binds operator-heavy input as a parameter instead of interpolating it", async () => {
    const q = '"fury vs" OR (wilder & -chess) :* <-> \'; DROP TABLE "Market"; --';

    await searchMarkets(q, 1, 20);

    for (const call of mockQueryRaw.mock.calls) {
      expect(call.slice(1)).toContain(q);
      expect(sqlText(call)).not.toContain("DROP TABLE");
      expect(sqlText(call)).not.toContain(q);
    }
  });

  it("returns cached results without querying the database", async () => {
    mockGet.mockResolvedValueOnce(JSON.stringify({ data: [{ id: "m1" }], total: 1 }));

    const result = await searchMarkets("fury", 1, 20);

    expect(result).toEqual({ data: [{ id: "m1" }], total: 1 });
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });
});
