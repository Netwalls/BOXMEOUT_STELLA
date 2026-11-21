/**
 * B-138: streaming CSV export of a wallet's bet history.
 *
 * Covers spreadsheet formula escaping, stroop→XLM formatting, batched
 * streaming over a large dataset (no single full-history read), keyset
 * paging correctness, and handler input validation. DB is mocked.
 */
import type { NextFunction, Request, Response } from "express";
import {
  csvCell,
  stroopsToXlm,
  streamBetCsv,
  EXPORT_COLUMNS,
} from "../src/services/bet-export.service";
import { exportBetsCsvHandler } from "../src/api/controllers/bet-export.controller";

const mockFindMany = jest.fn();

jest.mock("../src/db", () => ({
  db: { bet: { findMany: (...args: unknown[]) => mockFindMany(...args) } },
}));

const ADDRESS = "G".repeat(56);

// ─── csvCell: escaping ───────────────────────────────────────────────────────

describe("B-138 — csvCell escaping", () => {
  test.each([
    ["=HYPERLINK", "'=HYPERLINK"],
    ["+1+1", "'+1+1"],
    ["-2", "'-2"],
    ["@SUM(A1)", "'@SUM(A1)"],
  ])("prefixes formula-like value %j with a single quote", (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  test("formula prefix plus CSV quoting when the value also has a comma", () => {
    expect(csvCell("=A1,B1")).toBe('"\'=A1,B1"');
  });

  test("plain values are not prefixed", () => {
    expect(csvCell("abc")).toBe("abc");
    expect(csvCell(42)).toBe("42");
  });

  test("commas, quotes and newlines are quoted with doubled quotes", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  test("null and undefined become empty cells", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});

// ─── stroopsToXlm ────────────────────────────────────────────────────────────

describe("B-138 — stroopsToXlm", () => {
  test.each([
    [10_000_000n, "1.0000000"],
    [1n, "0.0000001"],
    [0n, "0.0000000"],
    [123_456_789n, "12.3456789"],
    [-5_000_000n, "-0.5000000"],
  ])("%s stroops → %s XLM", (stroops, xlm) => {
    expect(stroopsToXlm(stroops)).toBe(xlm);
  });

  test("null payout is an empty XLM cell", () => {
    expect(stroopsToXlm(null)).toBe("");
  });
});

// ─── streamBetCsv ────────────────────────────────────────────────────────────

function makeBets(count: number, startMs = Date.UTC(2026, 0, 1)) {
  // Descending placedAt so the DB ordering matches the export order.
  return Array.from({ length: count }, (_, i) => ({
    id: `bet-${String(count - i).padStart(6, "0")}`,
    marketId: "m-1",
    side: "FighterA",
    amount: 10_000_000n,
    placedAt: new Date(startMs + (count - i) * 1000),
    claimed: false,
    payout: null,
    txHash: null,
  }));
}

/** Simulates Prisma's keyset-friendly findMany on an in-memory list. */
function fakeDbFrom(all: ReturnType<typeof makeBets>) {
  mockFindMany.mockImplementation(async (args: any) => {
    let rows = all;
    const where = args.where;
    if (where.OR) {
      const [a, b] = where.OR;
      rows = rows.filter(
        (r) =>
          r.placedAt < a.placedAt.lt ||
          (r.placedAt.getTime() === b.placedAt.getTime() && r.id < b.id.lt),
      );
    }
    return rows.slice(0, args.take);
  });
}

describe("B-138 — streamBetCsv", () => {
  test("writes the header first, then every row in order", async () => {
    const bets = makeBets(3);
    fakeDbFrom(bets);
    const chunks: string[] = [];

    const count = await streamBetCsv({ bet: { findMany: mockFindMany } } as any, ADDRESS, {}, (c) => {
      chunks.push(c);
    }, 10);

    expect(count).toBe(3);
    expect(chunks[0]).toBe(`${EXPORT_COLUMNS.join(",")}\r\n`);
    const body = chunks.slice(1).join("");
    const lines = body.trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0].startsWith("bet-000003,")).toBe(true);
  });

  test("large dataset: pages through every row in batches without one full read", async () => {
    const total = 2_500;
    const batch = 1_000;
    fakeDbFrom(makeBets(total));
    let writes = 0;
    let rowLines = 0;
    let first = true;

    const count = await streamBetCsv({ bet: { findMany: mockFindMany } } as any, ADDRESS, {}, (c) => {
      writes += 1;
      if (first) {
        first = false; // header chunk is not a data row
        return;
      }
      rowLines += c.split("\r\n").filter(Boolean).length;
    }, batch);

    expect(count).toBe(total);
    expect(rowLines).toBe(total);
    // Header + 3 data batches (1000, 1000, 500).
    expect(writes).toBe(4);
    // Every query is bounded by the batch size.
    for (const call of mockFindMany.mock.calls) {
      expect(call[0].take).toBe(batch);
    }
    expect(mockFindMany).toHaveBeenCalledTimes(3);
  });

  test("no duplicate or missing rows across a batch boundary", async () => {
    const total = 7;
    fakeDbFrom(makeBets(total));
    const ids: string[] = [];
    let first = true;

    await streamBetCsv({ bet: { findMany: mockFindMany } } as any, ADDRESS, {}, (c) => {
      if (first) {
        first = false; // skip header
        return;
      }
      for (const line of c.split("\r\n").filter(Boolean)) ids.push(line.split(",")[0]);
    }, 3);

    expect(new Set(ids).size).toBe(total);
    expect(ids).toHaveLength(total);
  });

  test("applies from/to bounds to the query", async () => {
    mockFindMany.mockResolvedValue([]);
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-02-01T00:00:00Z");

    await streamBetCsv({ bet: { findMany: mockFindMany } } as any, ADDRESS, { from, to }, () => {});

    expect(mockFindMany.mock.calls[0][0].where).toMatchObject({
      bettor: ADDRESS,
      placedAt: { gte: from, lte: to },
    });
  });

  test("formula-like market id is escaped in the output", async () => {
    mockFindMany.mockResolvedValueOnce([
      { ...makeBets(1)[0], marketId: "=cmd|' /C calc'!A0" },
    ]);
    let out = "";
    await streamBetCsv({ bet: { findMany: mockFindMany } } as any, ADDRESS, {}, (c) => {
      out += c;
    }, 10);
    expect(out).toContain("'=cmd");
  });
});

// ─── handler validation ──────────────────────────────────────────────────────

function fakeRes() {
  const headers: Record<string, string> = {};
  const res: any = {
    statusCode: 200,
    body: undefined,
    headersSent: false,
    headers,
    setHeader: (k: string, v: string) => {
      headers[k] = v;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
    write: jest.fn(() => {
      res.headersSent = true; // Express marks headers sent on first write
      return true;
    }),
    end: jest.fn(),
    once: jest.fn(),
    destroy: jest.fn(),
  };
  return res;
}

function reqWith(query: Record<string, unknown>) {
  return { params: { address: ADDRESS }, query } as unknown as Request;
}

describe("B-138 — exportBetsCsvHandler", () => {
  beforeEach(() => {
    mockFindMany.mockResolvedValue([]);
  });

  test("rejects a non-csv format with 400", async () => {
    const res = fakeRes();
    await exportBetsCsvHandler(reqWith({ format: "xlsx" }), res, jest.fn() as NextFunction);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  test("rejects an invalid date with 400", async () => {
    const res = fakeRes();
    await exportBetsCsvHandler(reqWith({ from: "not-a-date" }), res, jest.fn() as NextFunction);
    expect(res.statusCode).toBe(400);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  test("rejects from after to with 400", async () => {
    const res = fakeRes();
    await exportBetsCsvHandler(
      reqWith({ from: "2026-02-01", to: "2026-01-01" }),
      res,
      jest.fn() as NextFunction,
    );
    expect(res.statusCode).toBe(400);
  });

  test("sets CSV content type and an attachment filename, then ends the stream", async () => {
    const res = fakeRes();
    await exportBetsCsvHandler(reqWith({}), res, jest.fn() as NextFunction);

    expect(res.headers["Content-Type"]).toBe("text/csv; charset=utf-8");
    expect(res.headers["Content-Disposition"]).toBe(`attachment; filename="bets-${ADDRESS}.csv"`);
    expect(res.write).toHaveBeenCalled();
    expect(res.end).toHaveBeenCalled();
  });

  test("a DB failure after the header is sent tears down the stream", async () => {
    const failure = new Error("db down");
    mockFindMany.mockRejectedValueOnce(failure);
    const res = fakeRes();
    const next = jest.fn();

    await exportBetsCsvHandler(reqWith({}), res, next as NextFunction);

    // The header is written before the first query, so headers are already
    // sent: the stream is torn down and next() is not called.
    expect(res.destroy).toHaveBeenCalledWith(failure);
    expect(next).not.toHaveBeenCalled();
  });
});
